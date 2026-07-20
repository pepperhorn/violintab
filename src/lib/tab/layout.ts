// src/lib/tab/layout.ts
import { beatFraction } from "./durations";
import type { Beat, ChordAnnotation, Duration, InstrumentId, Measure, TabDoc, TimeSig, ViolinNote } from "./types";

export const LAYOUT = {
  LINE_GAP: 14,
  LEFT_PAD: 60,
  RIGHT_PAD: 16,
  TOP_PAD: 32,
  STEM_LEN: 20,
  SYSTEM_GAP: 80,
  MEASURE_PAD: 16,
  REPEAT_PAD: 14, // extra left inset after a forward-repeat barline
  BEAT_MIN_W: 28,
  BEAT_SCALE: 150,
  BOTTOM_PAD: 56,
  POSITION_ROW_H: 16, // reserved height for the "Nth pos." label row beneath a system
} as const;

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];
export function positionLabel(pos: number): string {
  return `${ORDINALS[pos] ?? `${pos}th`} pos.`;
}

export interface PlacedBeat {
  x: number; // center x of the beat slot
  measureIndex: number;
  globalBeatIndex: number;
  notes: ViolinNote[];
  duration: Duration;
  dotted: boolean;
  isRest: boolean;
  beamGroup: number | null; // shared id for beamed runs; null if not beam-eligible
  tripletGroup: number | null; // shared id for consecutive triplet beats; null otherwise
  flags: number; // 0 = quarter or longer, 1 = eighth, 2 = sixteenth
  chord?: ChordAnnotation; // symbol drawn in the chord row above this beat
  posLabel?: string; // "Nth pos." drawn below this beat when the hand position changes
  tie?: boolean; // tied into the next beat
}

export type BarlineKind = "single" | "final" | "repeatStart" | "repeatEnd";

export interface PlacedBarline {
  x: number;
  kind: BarlineKind;
  count?: number; // play-count shown at a backward repeat
}

export interface TabSystem {
  yTop: number;
  lineYs: number[];
  lineX0: number;
  lineX1: number;
  beats: PlacedBeat[];
  barlines: PlacedBarline[];
}

export interface HeaderLine {
  text: string;
  y: number;
  size: number;
  weight: number;
  italic?: boolean;
}

export interface TabLayout {
  systems: TabSystem[];
  width: number;
  height: number;
  instrument: InstrumentId;
  stringCount: number;
  tuning: string[];
  timeSig: TimeSig;
  keySig: string;
  header: HeaderLine[];
  chordRowH: number; // vertical space reserved above each system for chord symbols
  showStems: boolean;
  showNoteNames: boolean;
}

export interface LayoutOptions {
  width: number;
  tuning: string[];
  stringCount: number;
  timeSig: TimeSig;
  showStems: boolean;
  showNoteNames?: boolean;
  noteNameFontSize?: number;
  /** Hard cap on measures per system; a line still wraps earlier if too wide. */
  barsPerLine?: number;
  title?: string;
  subtitle?: string;
  feel?: string;
  headerGap?: number;
  titleSize?: number;
  subtitleSize?: number;
  feelSize?: number;
  keySize?: number;
  showKey?: boolean;
  chordFontSize?: number;
}

function buildHeader(opts: LayoutOptions, keySig: string): { lines: HeaderLine[]; topPad: number } {
  const gap = opts.headerGap ?? 5;
  const specs: Omit<HeaderLine, "y">[] = [];
  if (opts.title) specs.push({ text: opts.title, size: opts.titleSize ?? 18, weight: 700 });
  if (opts.subtitle) specs.push({ text: opts.subtitle, size: opts.subtitleSize ?? 14, weight: 500 });
  if (opts.feel)
    specs.push({ text: opts.feel, size: opts.feelSize ?? 12, weight: 500, italic: true });
  if (opts.showKey !== false)
    specs.push({ text: `Key: ${keySig}`, size: opts.keySize ?? 12, weight: 600 });

  const hasBlock = Boolean(opts.title || opts.subtitle || opts.feel);
  const lines: HeaderLine[] = [];
  let bottom = 6;
  for (const s of specs) {
    const y = bottom + s.size / 2;
    lines.push({ ...s, y });
    bottom = y + s.size / 2 + gap;
  }
  const topPad = hasBlock ? bottom + 6 : LAYOUT.TOP_PAD;
  return { lines, topPad };
}

/** Metric beam unit (in fractions of a whole note): beams break at these
 *  boundaries. Compound meters (6/8, 12/8) group by the dotted beat; 4/4 (and
 *  2/4) group by the half bar so eighths beam 4+4 with a break at the middle;
 *  other meters (3/4, …) group by the beat. */
function beamUnitFraction(ts: TimeSig): number {
  const beat = 1 / ts.den;
  if (ts.num % 3 === 0 && ts.num > 3) return 3 * beat; // 6/8, 9/8, 12/8
  if (ts.den === 4 && ts.num % 2 === 0) return 2 * beat; // 4/4, 2/4 -> half-bar groups
  return beat;
}

function flagsFor(duration: Duration): number {
  const base = duration.endsWith("t") ? duration.slice(0, -1) : duration;
  if (base === "e") return 1;
  if (base === "s") return 2;
  return 0;
}

function beatWidth(beat: Beat): number {
  const frac = beatFraction(beat.duration, beat.dotted);
  return LAYOUT.BEAT_MIN_W + frac * LAYOUT.BEAT_SCALE;
}

function measureWidth(measure: Measure): number {
  const beats = measure.beats.reduce((sum, b) => sum + beatWidth(b), 0);
  return beats + LAYOUT.MEASURE_PAD;
}

/** Representative hand position of a beat: the position of its first note. */
function beatPosition(beat: Beat): number | null {
  if (beat.isRest || beat.notes.length === 0) return null;
  return beat.notes[0].position ?? 1;
}

export function layoutTab(doc: TabDoc, opts: LayoutOptions): TabLayout {
  const avail = opts.width - LAYOUT.LEFT_PAD - LAYOUT.RIGHT_PAD;
  const staffHeight = (opts.stringCount - 1) * LAYOUT.LINE_GAP;
  const { lines: header, topPad } = buildHeader(opts, doc.keySig);

  const allBeats = doc.measures.flatMap((m) => m.beats);
  const hasChordLabel = allBeats.some((b) => b.chord?.label);
  const chordRowH = hasChordLabel ? (opts.chordFontSize ?? 13) + 10 : 0;
  // Reserve room for up to a double stop (two stacked names) when names are shown.
  const noteNameRowH = opts.showNoteNames ? (opts.noteNameFontSize ?? 10) * 2 + 8 : 0;
  const beamUnit = beamUnitFraction(opts.timeSig);

  // Pack measures into systems.
  const maxBars = opts.barsPerLine && opts.barsPerLine > 0 ? opts.barsPerLine : Infinity;
  const rows: Measure[][] = [];
  let row: Measure[] = [];
  let rowWidth = 0;
  for (const measure of doc.measures) {
    const w = measureWidth(measure);
    const widthWrap = !isFinite(maxBars) && rowWidth + w > avail;
    if (row.length > 0 && (row.length >= maxBars || widthWrap)) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    row.push(measure);
    rowWidth += w;
  }
  if (row.length > 0) rows.push(row);

  const systems: TabSystem[] = [];
  let globalBeatIndex = 0;
  let beamGroupSeq = 0;
  let tripletGroupSeq = 0;
  const totalMeasures = doc.measures.length;
  let measureCursor = 0;
  let prevPosition = 1; // tracks hand-position changes across the whole piece

  rows.forEach((rowMeasures, rowIdx) => {
    const yTop =
      topPad +
      chordRowH +
      rowIdx * (staffHeight + chordRowH + LAYOUT.POSITION_ROW_H + noteNameRowH + LAYOUT.SYSTEM_GAP);
    const lineYs = Array.from({ length: opts.stringCount }, (_, i) => yTop + i * LAYOUT.LINE_GAP);

    const beats: PlacedBeat[] = [];
    const barlines: PlacedBarline[] = [];
    let x = LAYOUT.LEFT_PAD;

    rowMeasures.forEach((measure) => {
      const localMeasureIndex = measureCursor;

      // Forward-repeat barline at the measure's left edge; nudge beats right of it.
      if (measure.repeatStart) {
        barlines.push({ x: x + 3, kind: "repeatStart" });
        x += LAYOUT.REPEAT_PAD;
      }

      // Beam grouping within this measure: eighths beam by the metric beam unit
      // (half bar in 4/4), but sixteenths (and shorter) beam by the beat — e.g.
      // 4/4 sixteenths in groups of 4. Breaks at rests / quarter-or-longer notes.
      const beatLen = 1 / opts.timeSig.den; // one beat (a quarter in /4 meters)
      let activeGroup: number | null = null;
      let groupKey = "";
      let beamPos = 0; // running position in the measure, in whole-note fractions
      const groupForBeat: (number | null)[] = [];
      measure.beats.forEach((b) => {
        const fl = flagsFor(b.duration);
        if (b.isRest || fl === 0) {
          activeGroup = null;
          groupForBeat.push(null);
          beamPos += beatFraction(b.duration, b.dotted);
          return;
        }
        const unit = fl >= 2 ? beatLen : beamUnit;
        const key = `${fl >= 2 ? "s" : "e"}${Math.floor(beamPos / unit + 1e-9)}`;
        if (activeGroup === null || key !== groupKey) {
          activeGroup = beamGroupSeq++;
          groupKey = key;
        }
        groupForBeat.push(activeGroup);
        beamPos += beatFraction(b.duration, b.dotted);
      });

      // Triplet grouping.
      let activeTriplet: number | null = null;
      const tripletForBeat: (number | null)[] = [];
      measure.beats.forEach((b) => {
        const isTriplet = b.duration.endsWith("t");
        if (!isTriplet) {
          activeTriplet = null;
          tripletForBeat.push(null);
          return;
        }
        if (activeTriplet === null) activeTriplet = tripletGroupSeq++;
        tripletForBeat.push(activeTriplet);
      });

      measure.beats.forEach((b, i) => {
        const w = beatWidth(b);
        // Position label: set when the hand position changes (rests carry it over).
        const pos = beatPosition(b);
        let posLabel: string | undefined;
        if (pos !== null && pos !== prevPosition) {
          posLabel = positionLabel(pos);
          prevPosition = pos;
        }
        beats.push({
          x: x + w / 2,
          measureIndex: localMeasureIndex,
          globalBeatIndex: globalBeatIndex++,
          notes: b.notes,
          duration: b.duration,
          dotted: b.dotted,
          isRest: b.isRest,
          beamGroup: groupForBeat[i],
          tripletGroup: tripletForBeat[i],
          flags: flagsFor(b.duration),
          chord: b.chord,
          posLabel,
          tie: b.tie,
        });
        x += w;
      });

      const barX = x + LAYOUT.MEASURE_PAD / 2;
      const kind: BarlineKind = measure.repeatEnd
        ? "repeatEnd"
        : localMeasureIndex === totalMeasures - 1
        ? "final"
        : "single";
      barlines.push({ x: barX, kind, count: measure.repeatCount });
      x += LAYOUT.MEASURE_PAD;
      measureCursor += 1;
    });

    systems.push({ yTop, lineYs, lineX0: LAYOUT.LEFT_PAD, lineX1: x, beats, barlines });
  });

  const lastSystem = systems[systems.length - 1];
  const height =
    (lastSystem ? lastSystem.yTop + staffHeight : LAYOUT.TOP_PAD) +
    LAYOUT.STEM_LEN +
    LAYOUT.POSITION_ROW_H +
    noteNameRowH +
    LAYOUT.BOTTOM_PAD;

  const contentRight = systems.reduce((m, s) => Math.max(m, s.lineX1), 0);
  const width = Math.max(opts.width, contentRight + LAYOUT.RIGHT_PAD);

  return {
    systems,
    width,
    height,
    instrument: doc.instrument,
    stringCount: opts.stringCount,
    tuning: opts.tuning,
    timeSig: opts.timeSig,
    keySig: doc.keySig,
    header,
    chordRowH,
    showStems: opts.showStems,
    showNoteNames: Boolean(opts.showNoteNames),
  };
}
