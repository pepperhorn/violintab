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

/** Which fretless bowed instrument a tab is written for. */
export type InstrumentId = "violin" | "cello";

/**
 * A fretless bowed string instrument: its tuning, open-string pitches, soundfont
 * patch, and the finger -> MIDI lookup used to resolve fingered notes. Strings
 * run high -> low, so index 0 / string 1 is the highest-pitched string (the top
 * staff line). See instruments.ts for the concrete configs and pitch.ts for how
 * `naturalFingerMidi` is consumed.
 */
export interface Instrument {
  id: InstrumentId;
  label: string;
  /** String letters, index 0 = string 1 (highest pitch) -> lowest. */
  tuning: string[];
  /** Open-string MIDI numbers, aligned to `tuning`. */
  openMidi: number[];
  /** MusyngKite soundfont patch name. */
  patch: string;
  /** Highest hand position the parser will accept. */
  maxPosition: number;
  /**
   * NATURAL[string letter][position] = [f1, f2, f3, f4] MIDI numbers. An empty
   * table means fingered pitches are unresolved — fingered notes stay silent and
   * only open strings sound — until the fingering chart is filled in.
   */
  naturalFingerMidi: Record<string, Record<number, number[]>>;
}

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
  tie?: boolean; // tied into the next beat (same-string notes sustain across)
}

export interface Measure {
  beats: Beat[];
  forcedBarline: boolean; // true when closed by an explicit barline token
  doubleBarline?: boolean; // draw a double barline at this measure's right ("||")
  repeatStart?: boolean; // draw a forward-repeat barline at this measure's left
  repeatEnd?: boolean; // draw a backward-repeat barline at this measure's right
  repeatCount?: number; // play-count shown at a backward repeat (e.g. x3)
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
  instrument: InstrumentId; // which instrument this tab is written for
  tuning: string[]; // string 1 -> 4 (violin E A D G, cello A D G C)
  keySig: string;
  timeSig: TimeSig;
  stringCount: number;
  measures: Measure[];
  errors: ParseError[];
}
