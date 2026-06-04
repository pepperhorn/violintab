// src/lib/tab/instruments.ts
import type { ViolinString } from "./types";

/** The violin, the only instrument this app renders. Strings run high -> low so
 *  string 1 (E) is the top staff line and string 4 (G) is the bottom. */
export const VIOLIN = {
  label: "Violin",
  tuning: ["E", "A", "D", "G"] as ViolinString[], // string 1 -> 4
  openMidi: [76, 69, 62, 55], // E5, A4, D4, G3
  patch: "violin", // MusyngKite soundfont instrument name
} as const;

export const STRING_COUNT = VIOLIN.tuning.length;

/** Map a string letter (e/a/d/g, any case) to a 1-based string index, or null. */
export function stringIndexFromLetter(letter: string): number | null {
  const idx = VIOLIN.tuning.indexOf(letter.toUpperCase() as ViolinString);
  return idx < 0 ? null : idx + 1;
}
