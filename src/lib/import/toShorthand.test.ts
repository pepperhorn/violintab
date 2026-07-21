import { describe, expect, it } from "vitest";
import { toShorthand } from "./toShorthand";
import { parseTab } from "@/lib/tab/parse";
import type { Measure } from "@/lib/tab/types";

const m = (beats: Measure["beats"], extra: Partial<Measure> = {}): Measure => ({
  beats, forcedBarline: true, ...extra,
});

describe("toShorthand", () => {
  it("emits duration prefixes only when they change", () => {
    const out = toShorthand([
      m([
        { notes: [{ string: 3, finger: 0 }], duration: "q", dotted: false, isRest: false },
        { notes: [{ string: 3, finger: 1 }], duration: "q", dotted: false, isRest: false },
        { notes: [{ string: 1, finger: 0 }], duration: "e", dotted: false, isRest: false },
      ]),
    ]);
    expect(out).toBe("q:d0 d1 e:e0");
  });

  it("emits double stops, positions, levels, rests, ties and barlines", () => {
    const out = toShorthand([
      m([
        { notes: [{ string: 1, finger: 1 }, { string: 2, finger: 2 }], duration: "q", dotted: false, isRest: false },
        { notes: [{ string: 2, finger: 2, level: "H", position: 3 }], duration: "q", dotted: false, isRest: false, tie: true },
        { notes: [], duration: "q", dotted: false, isRest: true },
      ], { doubleBarline: true }),
    ]);
    expect(out).toBe("q:e1:a2 (3)aH2 ~ r ||");
  });

  it("round-trips through parseTab", () => {
    const text = "q:d0 e:d1 d2 h:(3)e1 | q:a0:e0 aL2 r ||";
    const doc = parseTab(text, { keySig: "D", timeSig: { num: 4, den: 4 } });
    const back = parseTab(toShorthand(doc.measures), { keySig: "D", timeSig: { num: 4, den: 4 } });
    expect(back.measures).toEqual(doc.measures);
  });
});
