// src/lib/tab/instruments.ts
import type { Instrument, InstrumentId } from "./types";

/**
 * Natural (un-modified) finger pitches as MIDI numbers, keyed by
 * NATURAL[string letter][position] = [finger1, finger2, finger3, finger4].
 *
 * Violin finger placement is not a simple formula — within each position the
 * half/whole-step pattern differs per string — so this is a literal lookup
 * reconstructed from the standard fingering chart. The unmarked (natural) finger
 * is the key-appropriate/high placement (e.g. D-string finger 2 = F♯); `L` / `H`
 * shift it -/+ 1 semitone (see pitch.ts:noteToMidi). Each row is strictly
 * ascending. Positions 1–4 are supported. This chart is the pitch source of
 * truth; keep it in sync with
 * docs/superpowers/specs/2026-06-04-violin-tab-writer-design.md §4.
 */
const VIOLIN_FINGER_MIDI: Instrument["naturalFingerMidi"] = {
  G: { 1: [57, 59, 60, 62], 2: [58, 60, 62, 64], 3: [60, 62, 64, 65], 4: [62, 64, 66, 67] },
  D: { 1: [64, 66, 67, 69], 2: [65, 67, 69, 71], 3: [67, 69, 71, 72], 4: [69, 71, 72, 74] },
  A: { 1: [71, 73, 74, 76], 2: [72, 74, 76, 77], 3: [74, 76, 77, 79], 4: [76, 77, 79, 81] },
  E: { 1: [78, 80, 81, 83], 2: [79, 81, 83, 85], 3: [81, 83, 85, 86], 4: [83, 85, 86, 88] },
};

/**
 * Cello fingering chart — reconstructed from a standard neck-position chart
 * (open strings C2 G2 D3 A3; scientific pitch, middle C = C4 = MIDI 60).
 *
 * Cello fingering is not a transposition of the violin chart: the closed
 * neck-position hand spans only a minor third across fingers 1-4, so adjacent
 * fingers sit a semitone apart (unlike the violin's wider frame). Each row is
 * therefore mostly consecutive semitones; the top gap widens to a whole tone in
 * some of the four-finger positions (e.g. C string 3rd position 3->4 = G2->A2).
 * Rows stay strictly ascending. `L` / `H` shift a finger -/+ 1 semitone (see
 * pitch.ts:noteToMidi).
 *
 * The chart covers half position, the numbered neck positions 1-4, and the
 * intermediate positions between them. Thumb position is future work.
 *
 * Keyed by string letter; natural notes per finger [f1 f2 f3 f4]:
 *   C: .5 Db2·D2·Eb2·E2  1 D2·Eb2·E2·F2  ...  4 G#2·A2·Bb2·B2
 *   G: .5 Ab2·A2·Bb2·B2  1 A2·Bb2·B2·C3  ...  4 D#3·E3·F3·F#3
 *   D: .5 Eb3·E3·F3·F#3  1 E3·F3·F#3·G3  ...  4 A#3·B3·C4·C#4
 *   A: .5 Bb3·B3·C4·C#4  1 B3·C4·C#4·D4  ...  4 F4·F#4·G4·G#4
 */
const CELLO_FINGER_MIDI: Instrument["naturalFingerMidi"] = {
  C: { 0.5: [37, 38, 39, 40], 1: [38, 39, 40, 41], 1.5: [39, 40, 41, 42], 2: [40, 41, 42, 43], 2.5: [41, 42, 43, 44], 3: [42, 43, 44, 45], 3.5: [43, 44, 45, 46], 4: [44, 45, 46, 47] },
  G: { 0.5: [44, 45, 46, 47], 1: [45, 46, 47, 48], 1.5: [46, 47, 48, 49], 2: [47, 48, 49, 50], 2.5: [48, 49, 50, 51], 3: [49, 50, 51, 52], 3.5: [50, 51, 52, 53], 4: [51, 52, 53, 54] },
  D: { 0.5: [51, 52, 53, 54], 1: [52, 53, 54, 55], 1.5: [53, 54, 55, 56], 2: [54, 55, 56, 57], 2.5: [55, 56, 57, 58], 3: [56, 57, 58, 59], 3.5: [57, 58, 59, 60], 4: [58, 59, 60, 61] },
  A: { 0.5: [58, 59, 60, 61], 1: [59, 60, 61, 62], 1.5: [60, 61, 62, 63], 2: [61, 62, 63, 64], 2.5: [62, 63, 64, 65], 3: [63, 64, 65, 66], 3.5: [64, 65, 66, 67], 4: [65, 66, 67, 68] },
};

/** The violin. Strings run high -> low so string 1 (E) is the top staff line and
 *  string 4 (G) is the bottom. */
export const VIOLIN: Instrument = {
  id: "violin",
  label: "Violin",
  tuning: ["E", "A", "D", "G"], // string 1 -> 4
  openMidi: [76, 69, 62, 55], // E5, A4, D4, G3
  patch: "violin", // MusyngKite soundfont instrument name
  maxPosition: 4,
  naturalFingerMidi: VIOLIN_FINGER_MIDI,
};

/** The cello. Same four-string layout, tuned an octave-plus below the violin:
 *  string 1 (A) is the top staff line and string 4 (C) is the bottom. Fingered
 *  pitches resolve through CELLO_FINGER_MIDI (half through 4th position). */
export const CELLO: Instrument = {
  id: "cello",
  label: "Cello",
  tuning: ["A", "D", "G", "C"], // string 1 -> 4
  openMidi: [57, 50, 43, 36], // A3, D3, G2, C2
  patch: "cello", // MusyngKite soundfont instrument name
  maxPosition: 4,
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
