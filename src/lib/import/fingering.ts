import { VIOLIN } from "@/lib/tab/instruments";
import { noteToMidi } from "@/lib/tab/pitch";
import type { Instrument, ViolinNote } from "@/lib/tab/types";
import type { NormNote } from "./types";

export interface Placement { note: ViolinNote; position: number; string: number }
export interface Carried { position: number; string: number }

// Scoring weights — tuned by the tests above. Position shift dominates.
const SHIFT_COST = 10;
const CROSS_COST = 2;
const OPEN_BONUS = 3;
const LEVEL_PENALTY = 1;

/** All reachable placements keyed by resulting MIDI: open strings (finger 0),
 *  and every (string, position, finger) natural plus its L/H neighbours. */
export function buildPlacementIndex(instrument: Instrument): Map<number, Placement[]> {
  const idx = new Map<number, Placement[]>();
  const add = (midi: number | null, note: ViolinNote, position: number, string: number) => {
    if (midi === null) return;
    const list = idx.get(midi) ?? [];
    list.push({ note, position, string });
    idx.set(midi, list);
  };

  for (let string = 1; string <= instrument.tuning.length; string++) {
    add(instrument.openMidi[string - 1] ?? null, { string, finger: 0 }, 1, string);
  }
  const letters = instrument.tuning;
  for (let s = 0; s < letters.length; s++) {
    const table = instrument.naturalFingerMidi[letters[s]];
    if (!table) continue;
    for (const posKey of Object.keys(table)) {
      const position = Number(posKey);
      for (let finger = 1; finger <= 4; finger++) {
        for (const level of [undefined, "L", "H"] as const) {
          const note: ViolinNote = { string: s + 1, finger };
          if (level) note.level = level;
          if (position > 1) note.position = position;
          add(noteToMidi(note, instrument), note, position, s + 1);
        }
      }
    }
  }
  return idx;
}

function score(p: Placement, carried: Carried): number {
  let c = SHIFT_COST * Math.abs(p.position - carried.position);
  if (p.string !== carried.string) c += CROSS_COST;
  if (p.note.finger === 0) c -= OPEN_BONUS;
  if (p.note.level) c += LEVEL_PENALTY;
  c += p.position * 0.1; // low-position tiebreak
  return c;
}

/** Pick a placement for `midi`. Honors a valid embedded string/finger; otherwise
 *  scores candidates and returns the cheapest, carrying position/string forward.
 *  Returns note: null when the pitch is unreachable on this instrument. */
export function assignFingering(
  midi: number,
  carried: Carried,
  index: Map<number, Placement[]>,
  embed?: NormNote["embed"],
): { note: ViolinNote | null; carried: Carried } {
  let candidates = index.get(midi) ?? [];
  if (candidates.length === 0) return { note: null, carried };

  if (embed?.stringNum) {
    const onString = candidates.filter((p) => p.string === embed.stringNum);
    if (onString.length) candidates = onString; // else: mis-numbered, fall through
  }
  if (embed?.finger !== undefined) {
    const byFinger = candidates.filter((p) => p.note.finger === embed.finger);
    if (byFinger.length) candidates = byFinger;
  }

  let best = candidates[0];
  let bestScore = score(best, carried);
  for (const p of candidates.slice(1)) {
    const s = score(p, carried);
    if (s < bestScore) { best = p; bestScore = s; }
  }
  return { note: { ...best.note }, carried: { position: best.position, string: best.string } };
}

export const DEFAULT_INDEX = buildPlacementIndex(VIOLIN);
