// src/lib/tab/instruments.ts
import type { Instrument, InstrumentId } from "./types";

/**
 * Natural (un-modified) finger pitches as MIDI numbers, keyed by
 * NATURAL[string letter][position] = [finger1, finger2, finger3, finger4].
 *
 * Violin finger placement is not a simple formula — within each position the
 * half/whole-step pattern differs per string — so this is a literal lookup
 * reconstructed from the standard fingering chart. Each row is strictly
 * ascending. `L` / `H` fingerings are this value -/+ 1 semitone (see
 * pitch.ts:noteToMidi). This chart is the pitch source of truth; keep it in
 * sync with docs/superpowers/specs/2026-06-04-violin-tab-writer-design.md §4.
 */
const VIOLIN_FINGER_MIDI: Instrument["naturalFingerMidi"] = {
  G: { 1: [57, 59, 61, 63], 2: [59, 60, 62, 64], 3: [60, 62, 64, 65], 4: [62, 64, 65, 67], 5: [64, 65, 67, 69] },
  D: { 1: [64, 66, 68, 70], 2: [65, 67, 69, 71], 3: [67, 69, 71, 72], 4: [69, 71, 72, 74], 5: [71, 72, 74, 76] },
  A: { 1: [71, 73, 75, 77], 2: [72, 74, 76, 77], 3: [74, 76, 77, 79], 4: [76, 77, 79, 81], 5: [77, 79, 81, 83] },
  E: { 1: [78, 80, 82, 84], 2: [79, 81, 83, 84], 3: [81, 83, 84, 86], 4: [83, 84, 86, 88], 5: [84, 86, 88, 89] },
};

/**
 * Cello fingering chart — deliberately EMPTY for now.
 *
 * Cello fingering is not a transposition of the violin chart: the lower
 * positions span only a whole tone across fingers 1-4 (semitone gaps), plus the
 * cello has half-position and thumb-position conventions the violin lacks. So it
 * needs its own literal chart, reconstructed from a cello fingering reference,
 * the same way the violin chart was. Until then this stays empty, which makes
 * `noteToMidi` return null for fingered cello notes (they play silent) while
 * open strings still sound. See the "table the fingering work" follow-up.
 */
const CELLO_FINGER_MIDI: Instrument["naturalFingerMidi"] = {};

/** The violin. Strings run high -> low so string 1 (E) is the top staff line and
 *  string 4 (G) is the bottom. */
export const VIOLIN: Instrument = {
  id: "violin",
  label: "Violin",
  tuning: ["E", "A", "D", "G"], // string 1 -> 4
  openMidi: [76, 69, 62, 55], // E5, A4, D4, G3
  patch: "violin", // MusyngKite soundfont instrument name
  maxPosition: 5,
  naturalFingerMidi: VIOLIN_FINGER_MIDI,
};

/** The cello. Same four-string layout, tuned an octave-plus below the violin:
 *  string 1 (A) is the top staff line and string 4 (C) is the bottom. Fingered
 *  pitches are unresolved until CELLO_FINGER_MIDI is filled in. */
export const CELLO: Instrument = {
  id: "cello",
  label: "Cello",
  tuning: ["A", "D", "G", "C"], // string 1 -> 4
  openMidi: [57, 50, 43, 36], // A3, D3, G2, C2
  patch: "cello", // MusyngKite soundfont instrument name
  maxPosition: 7,
  naturalFingerMidi: CELLO_FINGER_MIDI,
};

export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  violin: VIOLIN,
  cello: CELLO,
};

/** Resolve an instrument id to its config, falling back to the violin for any
 *  missing/unknown id (e.g. an older TabDoc with no `instrument` field). */
export function getInstrument(id: InstrumentId | undefined): Instrument {
  return (id && INSTRUMENTS[id]) || VIOLIN;
}

/** Legacy alias: the violin has four strings and so does the cello. Prefer
 *  `instrument.tuning.length` when an instrument is in hand. */
export const STRING_COUNT = VIOLIN.tuning.length;

/** Map a string letter to a 1-based string index for the given instrument
 *  (violin by default), or null when the letter isn't one of its strings. */
export function stringIndexFromLetter(letter: string, instrument: Instrument = VIOLIN): number | null {
  const idx = instrument.tuning.indexOf(letter.toUpperCase());
  return idx < 0 ? null : idx + 1;
}
