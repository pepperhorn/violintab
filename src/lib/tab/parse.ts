// src/lib/tab/parse.ts
import { beatFraction, measureCapacity, parseDurationToken } from "./durations";
import { STRING_COUNT, VIOLIN, stringIndexFromLetter } from "./instruments";
import { MAX_POSITION } from "./pitch";
import type {
  Beat,
  ChordAnnotation,
  Duration,
  FingerLevel,
  Measure,
  ParseError,
  TabDoc,
  TimeSig,
  ViolinNote,
} from "./types";

export interface ParseOptions {
  keySig: string;
  timeSig: TimeSig;
}

const EPS = 1e-9;

/** A single note token: `(P)?<string><L|H>?<finger>`, e.g. `e0`, `aH2`, `(3)e1`.
 *  Case-insensitive on the string letter and the L/H level. */
const NOTE_RE = /^(?:\((\d+)\))?([eadg])([lh])?([0-4])$/i;

/** Parse one note segment. Returns the note, a specific error, or null when the
 *  text isn't a note token at all (so the caller can report "couldn't read"). */
export function parseNote(seg: string): ViolinNote | { error: string } | null {
  const m = NOTE_RE.exec(seg);
  if (!m) return null;

  const position = m[1] ? Number(m[1]) : 1;
  const string = stringIndexFromLetter(m[2]);
  const level = m[3] ? (m[3].toUpperCase() as FingerLevel) : undefined;
  const finger = Number(m[4]);

  if (string === null) return null; // unreachable given the regex, kept for safety
  if (position < 1 || position > MAX_POSITION) {
    return { error: `position ${position} out of range (1-${MAX_POSITION}) in "${seg}"` };
  }
  if (finger === 0 && level) {
    return { error: `open string can't take a low/high fingering in "${seg}"` };
  }

  const note: ViolinNote = { string, finger };
  if (level) note.level = level;
  if (position > 1) note.position = position;
  return note;
}

/** Parse the inside of a [..] token into a chord annotation (label text only). */
function parseChordToken(content: string): ChordAnnotation | null {
  const label = content.trim();
  return label ? { label } : null;
}

export function parseTab(text: string, opts: ParseOptions): TabDoc {
  const capacity = measureCapacity(opts.timeSig);

  const measures: Measure[] = [];
  const errors: ParseError[] = [];

  let curMeasure: Beat[] = [];
  let curFrac = 0;
  let curDuration: Duration = "q";
  let curDotted = false;
  let lastBeat: Beat | null = null;
  let pendingChord: ChordAnnotation | null = null;
  let pendingChordLine = 0;

  function closeMeasure(forced: boolean) {
    if (curMeasure.length === 0) return;
    measures.push({ beats: curMeasure, forcedBarline: forced });
    curMeasure = [];
    curFrac = 0;
  }

  function pushBeat(beat: Beat) {
    if (pendingChord) {
      beat.chord = pendingChord;
      pendingChord = null;
    }
    curMeasure.push(beat);
    lastBeat = beat;
    curFrac += beatFraction(beat.duration, beat.dotted);
    if (curFrac >= capacity - EPS) closeMeasure(false);
  }

  const lines = text.split("\n");
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    // Match [..] groups (which may contain spaces) or any non-space run.
    const tokens = line.match(/\[[^\]]*\]|\S+/g) ?? [];

    for (const raw of tokens) {
      // Barline
      if (raw === "|") {
        closeMeasure(true);
        continue;
      }
      // Chord annotation (text only) attaches to the NEXT beat
      if (raw.startsWith("[") && raw.endsWith("]")) {
        const ann = parseChordToken(raw.slice(1, -1));
        if (ann) {
          pendingChord = ann;
          pendingChordLine = lineNo;
        }
        continue;
      }
      // Repeat previous beat
      if (raw === "x" || raw === "X") {
        if (!lastBeat) {
          errors.push({ line: lineNo, message: `"${raw}" has no preceding beat to repeat` });
          continue;
        }
        pushBeat({
          notes: lastBeat.notes.map((n) => ({ ...n })),
          duration: lastBeat.duration,
          dotted: lastBeat.dotted,
          isRest: lastBeat.isRest,
        });
        continue;
      }

      // Beat: colon-split, optional leading duration prefix
      const segs = raw.split(":");
      let rest = segs;
      const dur = parseDurationToken(segs[0]);
      if (dur) {
        curDuration = dur.duration;
        curDotted = dur.dotted;
        rest = segs.slice(1);
      }

      // Rest beat: empty payload or explicit r/R
      if (rest.length === 0 || (rest.length === 1 && (rest[0] === "r" || rest[0] === "R"))) {
        pushBeat({ notes: [], duration: curDuration, dotted: curDotted, isRest: true });
        continue;
      }

      // Note / double-stop beat
      const notes: ViolinNote[] = [];
      let ok = true;
      for (const seg of rest) {
        const res = parseNote(seg);
        if (res === null) {
          errors.push({ line: lineNo, message: `couldn't read "${raw}"` });
          ok = false;
          break;
        }
        if ("error" in res) {
          errors.push({ line: lineNo, message: res.error });
          ok = false;
          break;
        }
        notes.push(res);
      }
      if (!ok) continue;
      pushBeat({ notes, duration: curDuration, dotted: curDotted, isRest: false });
    }
  });

  closeMeasure(false);

  if (pendingChord) {
    errors.push({ line: pendingChordLine, message: "chord annotation has no following note" });
  }

  return {
    tuning: [...VIOLIN.tuning],
    keySig: opts.keySig,
    timeSig: opts.timeSig,
    stringCount: STRING_COUNT,
    measures,
    errors,
  };
}
