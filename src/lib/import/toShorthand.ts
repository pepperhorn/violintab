import type { Duration, Measure, ViolinNote } from "@/lib/tab/types";

/** Duration prefix token, e.g. "q", "qd" (dotted), "et" (triplet eighth). Order
 *  matches parseDurationToken's `<base>[t][d]` grammar (triplet before dotted). */
function durToken(d: Duration, dotted: boolean): string {
  const triplet = d.endsWith("t");
  const base = triplet ? d.slice(0, -1) : d;
  return `${base}${triplet ? "t" : ""}${dotted ? "d" : ""}`;
}

/** Serialize placed measures to shorthand — the inverse of parseTab. Duration
 *  prefixes are dropped when unchanged from the previous beat, and the hand
 *  position is sticky: a `(P)` marker is emitted only when a note's position
 *  differs from the running one (parseTab carries both forward). Because the
 *  position is sticky, a drop back to a lower position MUST emit an explicit
 *  marker (including `(1)`), or the re-parsed note would inherit the stale
 *  higher position. Tuning maps the string index to a letter. */
export function toShorthand(measures: Measure[], tuning = ["E", "A", "D", "G"]): string {
  const tokens: string[] = [];
  let prevDur: string | null = null;
  let emittedPos = 1; // running hand position already written into the output
  const noteToken = (n: ViolinNote): string => {
    const letter = (tuning[n.string - 1] ?? "e").toLowerCase();
    const p = n.position ?? 1;
    const marker = p !== emittedPos ? `(${p})` : "";
    if (p !== emittedPos) emittedPos = p;
    return `${marker}${letter}${n.level ?? ""}${n.finger}`;
  };
  measures.forEach((measure, mi) => {
    if (measure.repeatStart) tokens.push("|:");
    for (const beat of measure.beats) {
      const dur = durToken(beat.duration, beat.dotted);
      const body = beat.isRest ? "r" : beat.notes.map((n) => noteToken(n)).join(":");
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
