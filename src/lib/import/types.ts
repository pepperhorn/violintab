import type { InstrumentId } from "@/lib/tab/types";

/** Public result the workbench applies to its state. */
export interface ImportResult {
  text: string;
  instrument: InstrumentId;
  keySig: string;
  timeSig: string;
  tempo: number;
  warnings: string[];
}

/** A hard failure that leaves the current tab untouched. */
export interface ImportError {
  error: string;
}

export type ImportOutcome = ImportResult | ImportError;

export function isImportError(o: ImportOutcome): o is ImportError {
  return (o as ImportError).error !== undefined;
}

/** Normalized MusicXML, format-ugliness removed (produced by parseDocument). */
export interface NormalizedScore {
  header: {
    keyFifths: number;
    keyMode?: "major" | "minor";
    beats: number;
    beatType: number;
    tempo?: number;
    instrumentHint?: InstrumentId;
    divisions: number;
  };
  measures: NormMeasure[];
  warnings: string[];
}

export interface NormMeasure {
  notes: NormNote[];
  repeatStart?: boolean;
  repeatEnd?: boolean;
  repeatCount?: number;
  doubleBarline?: boolean;
}

export interface NormNote {
  isRest: boolean;
  chord: boolean; // sounds with the previous note (double stop)
  pitchMidi?: number; // absent for rests
  type: "w" | "h" | "q" | "e" | "s";
  dots: number;
  triplet: boolean;
  tieStart: boolean;
  embed?: { stringNum?: number; finger?: number };
}
