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
 * Positions 1-4 are the four-finger neck positions from the source chart. The
 * 1st finger climbs the open string's major scale (degrees 2-3-4-5), so 5th-7th
 * continue it onto degrees 6, 7 and the octave — e.g. the A string's 7th-position
 * 1st finger is A4, the octave above the open A3 (the top-of-neck landmark).
 * Positions 5-7 are the "three-finger" positions where the notes crowd together
 * and fingers 1-2-3 do the work; their natural frame is the closed hand
 * (consecutive semitones, 4th finger a minor third above the 1st). Thumb
 * position (above 7th) is future work.
 *
 * Keyed by string letter; natural notes per finger [f1 f2 f3 f4]:
 *   C: 1 D2·E2·F2  2 E2·F2·G2  3 F2·G2·A2  4 G2·A2·B2  5 A2·B2·C3  6 B2·C3·D3  7 C3·D3·D#3
 *   G: 1 A2·B2·C3  2 B2·C3·D3  3 C3·D3·E3  4 D3·E3·F3  5 E3·F#3·G3 6 F#3·G3·A3 7 G3·A3·A#3
 *   D: 1 E3·F#3·G3 2 F#3·G3·A3 3 G3·A3·B3  4 A3·B3·C4  5 B3·C#4·D4 6 C#4·D4·E4 7 D4·E4·F4
 *   A: 1 B3·C#4·D4 2 C#4·D4·E4 3 D4·E4·F4  4 E4·F4·G4  5 F#4·G#4·A4 6 G#4·A4·B4 7 A4·B4·C5
 * (fingers the chart omits are the chromatic step between — e.g. C string 1st
 * position finger 2 = Eb2/D#2. `L`/`H` reach the neighbours of any natural finger.)
 */
const CELLO_FINGER_MIDI: Instrument["naturalFingerMidi"] = {
  C: { 1: [38, 39, 40, 41], 2: [40, 41, 42, 43], 3: [41, 42, 43, 45], 4: [43, 44, 45, 47], 5: [45, 46, 47, 48], 6: [47, 48, 49, 50], 7: [48, 49, 50, 51] },
  G: { 1: [45, 46, 47, 48], 2: [47, 48, 49, 50], 3: [48, 49, 50, 52], 4: [50, 51, 52, 53], 5: [52, 53, 54, 55], 6: [54, 55, 56, 57], 7: [55, 56, 57, 58] },
  D: { 1: [52, 53, 54, 55], 2: [54, 55, 56, 57], 3: [55, 56, 57, 59], 4: [57, 58, 59, 60], 5: [59, 60, 61, 62], 6: [61, 62, 63, 64], 7: [62, 63, 64, 65] },
  A: { 1: [59, 60, 61, 62], 2: [61, 62, 63, 64], 3: [62, 63, 64, 65], 4: [64, 65, 66, 67], 5: [66, 67, 68, 69], 6: [68, 69, 70, 71], 7: [69, 70, 71, 72] },
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
 *  pitches resolve through CELLO_FINGER_MIDI (neck positions 1-7). */
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
