import { getInstrument } from "@/lib/tab/instruments";
import type { Beat, Duration, InstrumentId, Measure } from "@/lib/tab/types";
import { assignFingering, buildPlacementIndex, type Carried } from "./fingering";
import { parseDocument } from "./musicxml/parseDocument";
import { toShorthand } from "./toShorthand";
import type { ImportOutcome, NormNote, NormalizedScore } from "./types";

// fifths (major) -> key name; minor shifts by the relative-minor label.
const SHARP_MAJOR = ["C", "G", "D", "A", "E", "B", "F#", "C#"];
const FLAT_MAJOR = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"];
const SHARP_MINOR = ["A", "E", "B", "F#", "C#", "G#", "D#", "A#"];
const FLAT_MINOR = ["A", "D", "G", "C", "F", "Bb", "Eb", "Ab"];

function keyName(fifths: number, mode?: "major" | "minor"): string {
  const i = Math.abs(fifths);
  if (mode === "minor") {
    const n = fifths >= 0 ? SHARP_MINOR[i] : FLAT_MINOR[i];
    return `${n ?? "A"}m`;
  }
  return (fifths >= 0 ? SHARP_MAJOR[i] : FLAT_MAJOR[i]) ?? "C";
}

function duration(n: NormNote): Duration {
  return (n.triplet ? `${n.type}t` : n.type) as Duration;
}

export function importMusicXml(
  bytes: Uint8Array | string,
  opts: { fallbackInstrument: InstrumentId },
): ImportOutcome {
  const parsed = parseDocument(bytes);
  if ("error" in parsed) return parsed;
  const score: NormalizedScore = parsed;

  const instrumentId = score.header.instrumentHint ?? opts.fallbackInstrument;
  const instrument = getInstrument(instrumentId);
  const index = buildPlacementIndex(instrument);
  const warnings = [...score.warnings];

  let carried: Carried = { position: 1, string: 1 };
  let unfingered = 0;

  const measures: Measure[] = score.measures.map((nm) => {
    const beats: Beat[] = [];
    for (const n of nm.notes) {
      if (n.isRest) {
        beats.push({ notes: [], duration: duration(n), dotted: n.dots > 0, isRest: true });
        continue;
      }
      const midi = n.pitchMidi;
      let placement = midi === undefined ? { note: null, carried } : assignFingering(midi, carried, index, n.embed);
      carried = placement.carried;

      if (!placement.note) {
        unfingered++;
        // Chord continuation with no placement is dropped; a lead note becomes a rest.
        if (!n.chord) beats.push({ notes: [], duration: duration(n), dotted: n.dots > 0, isRest: true });
        continue;
      }
      if (n.chord && beats.length) {
        beats[beats.length - 1].notes.push(placement.note); // double stop on the previous beat
      } else {
        const beat: Beat = { notes: [placement.note], duration: duration(n), dotted: n.dots > 0, isRest: false };
        if (n.tieStart) beat.tie = true;
        beats.push(beat);
      }
    }
    const m: Measure = { beats, forcedBarline: true };
    if (nm.repeatStart) m.repeatStart = true;
    if (nm.repeatEnd) m.repeatEnd = true;
    if (nm.repeatCount) m.repeatCount = nm.repeatCount;
    if (nm.doubleBarline) m.doubleBarline = true;
    return m;
  });

  if (unfingered > 0) {
    warnings.push(
      `${unfingered} note(s) could not be fingered for ${instrument.label}` +
        (instrumentId === "cello" ? " — the cello fingering chart is not yet filled in." : "."),
    );
  }

  return {
    text: toShorthand(measures, [...instrument.tuning]),
    instrument: instrumentId,
    keySig: keyName(score.header.keyFifths, score.header.keyMode),
    timeSig: `${score.header.beats}/${score.header.beatType}`,
    tempo: score.header.tempo ?? 96,
    warnings,
  };
}
