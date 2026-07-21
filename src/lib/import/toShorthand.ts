import type { Duration, Measure, ViolinNote } from "@/lib/tab/types";

/** One note token: (P)?<string><L|H>?<finger>, string letter lowercased. */
function noteToken(n: ViolinNote, tuning: string[]): string {
  const letter = (tuning[n.string - 1] ?? "e").toLowerCase();
  const pos = n.position && n.position > 1 ? `(${n.position})` : "";
  return `${pos}${letter}${n.level ?? ""}${n.finger}`;
}

/** Duration prefix token, e.g. "q", "qd" (dotted), "et" (triplet eighth). Order
 *  matches parseDurationToken's `<base>[t][d]` grammar (triplet before dotted). */
function durToken(d: Duration, dotted: boolean): string {
  const triplet = d.endsWith("t");
  const base = triplet ? d.slice(0, -1) : d;
  return `${base}${triplet ? "t" : ""}${dotted ? "d" : ""}`;
}

/** Serialize placed measures to shorthand — the inverse of parseTab. Duration
 *  prefixes are dropped when unchanged from the previous beat (parseTab carries
 *  them forward). Tuning is fixed to the violin/cello letters via string index. */
export function toShorthand(measures: Measure[], tuning = ["E", "A", "D", "G"]): string {
  const tokens: string[] = [];
  let prevDur: string | null = null;
  measures.forEach((measure, mi) => {
    if (measure.repeatStart) tokens.push("|:");
    for (const beat of measure.beats) {
      const dur = durToken(beat.duration, beat.dotted);
      const body = beat.isRest ? "r" : beat.notes.map((n) => noteToken(n, tuning)).join(":");
      tokens.push(dur === prevDur ? body : `${dur}:${body}`);
      prevDur = dur;
      if (beat.tie) tokens.push("~");
    }
    if (measure.repeatEnd) tokens.push(measure.repeatCount ? `:|x${measure.repeatCount}` : ":|");
    else if (measure.doubleBarline) tokens.push("||");
    else if (mi < measures.length - 1) tokens.push("|");
  });
  return tokens.join(" ");
}
