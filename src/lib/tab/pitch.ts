// src/lib/tab/pitch.ts
import { VIOLIN } from "./instruments";
import type { ViolinNote, ViolinString } from "./types";

/**
 * Natural (un-modified) finger pitches as MIDI numbers, keyed by
 * NATURAL[string][position] = [finger1, finger2, finger3, finger4].
 *
 * Violin finger placement is not a simple formula — within each position the
 * half/whole-step pattern differs per string — so this is a literal lookup
 * reconstructed from the standard fingering chart. Each row is strictly
 * ascending. `L` / `H` fingerings are this value -/+ 1 semitone (see noteToMidi).
 *
 * See docs/superpowers/specs/2026-06-04-violin-tab-writer-design.md §4.
 */
export const NATURAL_FINGER_MIDI: Record<ViolinString, Record<number, number[]>> = {
  G: { 1: [57, 59, 61, 63], 2: [59, 60, 62, 64], 3: [60, 62, 64, 65], 4: [62, 64, 65, 67], 5: [64, 65, 67, 69] },
  D: { 1: [64, 66, 68, 70], 2: [65, 67, 69, 71], 3: [67, 69, 71, 72], 4: [69, 71, 72, 74], 5: [71, 72, 74, 76] },
  A: { 1: [71, 73, 75, 77], 2: [72, 74, 76, 77], 3: [74, 76, 77, 79], 4: [76, 77, 79, 81], 5: [77, 79, 81, 83] },
  E: { 1: [78, 80, 82, 84], 2: [79, 81, 83, 84], 3: [81, 83, 84, 86], 4: [83, 84, 86, 88], 5: [84, 86, 88, 89] },
};

export const MAX_POSITION = 5;

/**
 * Resolve a violin note to a MIDI pitch.
 * - finger 0 (open) sounds the open string, ignoring position/level.
 * - finger 1-4 look up the natural pitch for the string + position, then shift
 *   a semitone down for 'L' (low) or up for 'H' (high).
 * Returns null if the (string, position, finger) combination is out of range.
 */
export function noteToMidi(note: ViolinNote): number | null {
  const letter = VIOLIN.tuning[note.string - 1];
  if (!letter) return null;

  if (note.finger === 0) return VIOLIN.openMidi[note.string - 1];

  const position = note.position ?? 1;
  const row = NATURAL_FINGER_MIDI[letter][position];
  if (!row) return null;
  const base = row[note.finger - 1];
  if (base === undefined) return null;

  const shift = note.level === "L" ? -1 : note.level === "H" ? 1 : 0;
  return base + shift;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
