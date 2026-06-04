// src/lib/tab/durations.ts
import type { Duration, TimeSig } from "./types";

export const DURATION_FRACTION: Record<Duration, number> = {
  w: 1,
  wt: 2 / 3,
  h: 1 / 2,
  ht: 1 / 3,
  q: 1 / 4,
  qt: 1 / 6,
  e: 1 / 8,
  et: 1 / 12,
  s: 1 / 16,
  st: 1 / 24,
};

export function beatFraction(duration: Duration, dotted: boolean): number {
  return DURATION_FRACTION[duration] * (dotted ? 1.5 : 1);
}

export function measureCapacity(timeSig: TimeSig): number {
  return timeSig.num / timeSig.den;
}

const BASE_LETTER: Record<string, "s" | "e" | "q" | "h" | "w"> = {
  s: "s",
  e: "e",
  q: "q",
  h: "h",
  w: "w",
};

const SPELLED: Record<string, "s" | "e" | "q" | "h" | "w"> = {
  sixteenth: "s",
  eighth: "e",
  quarter: "q",
  half: "h",
  whole: "w",
};

function build(base: "s" | "e" | "q" | "h" | "w", triplet: boolean, dotted: boolean) {
  const duration = (triplet ? `${base}t` : base) as Duration;
  return { duration, dotted };
}

export function parseDurationToken(
  seg: string,
): { duration: Duration; dotted: boolean } | null {
  if (!seg) return null;
  const token = seg.toLowerCase();

  // Shorthand: <base>[t][d]
  const m = /^(s|e|q|h|w)(t)?(d)?$/.exec(token);
  if (m) return build(BASE_LETTER[m[1]], Boolean(m[2]), Boolean(m[3]));

  // Spelled-out: hyphen-separated base + modifiers
  const parts = token.split("-");
  let base: "s" | "e" | "q" | "h" | "w" | null = null;
  let triplet = false;
  let dotted = false;
  for (const p of parts) {
    if (SPELLED[p]) {
      if (base) return null; // two base words = invalid
      base = SPELLED[p];
    } else if (p === "triplet") triplet = true;
    else if (p === "dotted") dotted = true;
    else return null; // unknown word
  }
  if (!base) return null;
  return build(base, triplet, dotted);
}
