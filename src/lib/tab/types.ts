// src/lib/tab/types.ts

/** Base duration + optional triplet. Dotted is carried separately on Beat. */
export type Duration =
  | "w" | "wt"
  | "h" | "ht"
  | "q" | "qt"
  | "e" | "et"
  | "s" | "st";

/** Low / high fingering (a semitone below / above the natural finger). */
export type FingerLevel = "L" | "H";

/** The four violin strings, string 1 (highest pitch) -> 4 (lowest). */
export type ViolinString = "E" | "A" | "D" | "G";

export interface ViolinNote {
  string: number; // 1 = highest-pitch string (E), 4 = lowest (G)
  finger: number; // 0-4; 0 = open string
  level?: FingerLevel; // low / high fingering
  position?: number; // hand position; default 1
}

/** Chord annotation shown above a beat: a text symbol (no diagram for violin). */
export interface ChordAnnotation {
  label: string;
}

export interface Beat {
  notes: ViolinNote[]; // empty = rest
  duration: Duration;
  dotted: boolean;
  isRest: boolean;
  chord?: ChordAnnotation;
}

export interface Measure {
  beats: Beat[];
  forcedBarline: boolean; // true when closed by an explicit "|"
}

export interface ParseError {
  line: number; // 1-based
  message: string;
}

export interface TimeSig {
  num: number;
  den: number;
}

export interface TabDoc {
  tuning: string[]; // string 1 -> 4 (E A D G)
  keySig: string;
  timeSig: TimeSig;
  stringCount: number;
  measures: Measure[];
  errors: ParseError[];
}
