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
  let droppedChord = 0;

  const measures: Measure[] = score.measures.map((nm) => {
    const beats: Beat[] = [];
    for (const n of nm.notes) {
      if (n.isRest) {
        beats.push({ notes: [], duration: duration(n), dotted: n.dots > 0, isRest: true });
        continue;
      }
      const midi = n.pitchMidi;

      if (n.chord && beats.length) {
        // Double stop on the previous beat: keep it off strings already in use,
        // and do not move the melodic hand position.
        const lead = beats[beats.length - 1];
        const occupied = new Set(lead.notes.map((nn) => nn.string));
        const p = midi === undefined
          ? { note: null, carried }
          : assignFingering(midi, carried, index, n.embed, occupied);
        if (p.note) lead.notes.push(p.note);
        else droppedChord++;
        continue;
      }

      const p = midi === undefined ? { note: null, carried } : assignFingering(midi, carried, index, n.embed);
      carried = p.carried;
      if (!p.note) {
        unfingered++;
        beats.push({ notes: [], duration: duration(n), dotted: n.dots > 0, isRest: true });
        continue;
      }
      const beat: Beat = { notes: [p.note], duration: duration(n), dotted: n.dots > 0, isRest: false };
      if (n.tieStart) beat.tie = true;
      beats.push(beat);
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
      `${unfingered} note(s) fell outside ${instrument.label}'s supported range (positions 1-${instrument.maxPosition}) and were left as rests.`,
    );
  }
  if (droppedChord > 0) {
    warnings.push(`${droppedChord} double-stop note(s) could not be placed on a free string and were dropped.`);
  }

  return {
    text: toShorthand(measures, [...instrument.tuning]),
    instrument: instrumentId,
    keySig: keyName(score.header.keyFifths, score.header.keyMode),
    timeSig: `${score.header.beats}/${score.header.beatType}`,
    tempo: score.header.tempo ?? 96,
    warnings: [...new Set(warnings)],
  };
}
