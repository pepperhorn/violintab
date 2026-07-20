// src/lib/tab/pitch.ts
import { VIOLIN } from "./instruments";
import type { Instrument, ViolinNote } from "./types";

/**
 * Backward-compatible aliases for the violin's pitch data. The fingering charts
 * now live on each instrument (see instruments.ts); these expose the violin's so
 * existing callers/tests keep resolving against it by default. Prefer reading
 * `instrument.naturalFingerMidi` / `instrument.maxPosition` when you have one.
 */
export const NATURAL_FINGER_MIDI = VIOLIN.naturalFingerMidi;
export const MAX_POSITION = VIOLIN.maxPosition;

/**
 * Resolve a note to a MIDI pitch on the given instrument (violin by default).
 * - finger 0 (open) sounds the open string, ignoring position/level.
 * - finger 1-4 look up the natural pitch for the string + position, then shift
 *   a semitone down for 'L' (low) or up for 'H' (high).
 * Returns null if the (string, position, finger) combination is out of range,
 * or if the instrument has no fingering chart entry for it (e.g. cello, whose
 * chart is not yet filled in, so its fingered notes resolve to null).
 */
export function noteToMidi(note: ViolinNote, instrument: Instrument = VIOLIN): number | null {
  const letter = instrument.tuning[note.string - 1];
  if (!letter) return null;

  if (note.finger === 0) return instrument.openMidi[note.string - 1] ?? null;

  const position = note.position ?? 1;
  const row = instrument.naturalFingerMidi[letter]?.[position];
  if (!row) return null;
  const base = row[note.finger - 1];
  if (base === undefined) return null;

  const shift = note.level === "L" ? -1 : note.level === "H" ? 1 : 0;
  return base + shift;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Keys spelled with flats (majors + minors). Everything else uses sharps.
const FLAT_KEYS = new Set([
  "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb",
  "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm",
]);

export function keyUsesFlats(keySig: string): boolean {
  return FLAT_KEYS.has(keySig.trim());
}

/** Spell a MIDI pitch as a note name (ASCII accidentals: "F#", "Bb"). Octave is
 *  appended only when `withOctave` is set. Sharp/flat spelling follows the key. */
export function midiToNoteName(midi: number, useFlats = false, withOctave = false): string {
  const pc = ((midi % 12) + 12) % 12;
  const name = (useFlats ? FLAT_NAMES : SHARP_NAMES)[pc];
  return withOctave ? `${name}${Math.floor(midi / 12) - 1}` : name;
}
