// src/lib/tab/layout.test.ts
import { describe, expect, it } from "vitest";
import { layoutTab } from "./layout";
import { parseTab } from "./parse";
import type { TimeSig } from "./types";

function layoutOf(text: string, timeSig: TimeSig = { num: 4, den: 4 }) {
  const doc = parseTab(text, { keySig: "C", timeSig });
  return layoutTab(doc, {
    width: 4000,
    tuning: ["E", "A", "D", "G"],
    stringCount: 4,
    timeSig,
    showStems: true,
  });
}

function beamGroups(text: string, timeSig: TimeSig = { num: 4, den: 4 }) {
  return layoutOf(text, timeSig).systems.flatMap((s) => s.beats).map((b) => b.beamGroup);
}

describe("barlines", () => {
  it("emits a double barline kind for a `||` measure", () => {
    const kinds = layoutOf("q:e0 q:e1 q:e2 q:e3 || q:a0 a1 a2 a3")
      .systems.flatMap((s) => s.barlines)
      .map((b) => b.kind);
    expect(kinds[0]).toBe("double");
    expect(kinds[1]).toBe("final"); // last measure still closes with the final barline
  });
});

describe("beaming", () => {
  it("breaks 4/4 eighth-note beams at the half bar (between 2& and 3)", () => {
    const g = beamGroups("e:e0 e0 e0 e0 e0 e0 e0 e0");
    expect(g).toHaveLength(8);
    expect(new Set(g).size).toBe(2); // two beam groups of four
    expect(g.slice(0, 4).every((x) => x === g[0])).toBe(true);
    expect(g.slice(4, 8).every((x) => x === g[4])).toBe(true);
    expect(g[0]).not.toBe(g[4]); // the break lands in the middle of the bar
  });

  it("beams 4/4 sixteenths in groups of four (per beat)", () => {
    const g = beamGroups("s:" + "e0 ".repeat(16).trim());
    expect(g).toHaveLength(16);
    expect(new Set(g).size).toBe(4); // four beam groups of four
    for (let beat = 0; beat < 4; beat++) {
      const grp = g.slice(beat * 4, beat * 4 + 4);
      expect(grp.every((x) => x === grp[0])).toBe(true);
    }
    expect(new Set([g[0], g[4], g[8], g[12]]).size).toBe(4); // all distinct
  });

  it("beams 6/8 eighths in groups of three", () => {
    const g = beamGroups("e:e0 e0 e0 e0 e0 e0", { num: 6, den: 8 });
    expect(new Set(g).size).toBe(2);
    expect(g.slice(0, 3).every((x) => x === g[0])).toBe(true);
    expect(g.slice(3, 6).every((x) => x === g[3])).toBe(true);
  });

  it("beams 3/4 eighths per beat (three groups of two)", () => {
    const g = beamGroups("e:e0 e0 e0 e0 e0 e0", { num: 3, den: 4 });
    expect(new Set(g).size).toBe(3);
  });

  it("breaks a beam at a rest", () => {
    // Two eighths, a quarter rest, then two more eighths (in the second half bar).
    const g = beamGroups("e:e0 e0 q:r e:e0 e0");
    expect(g[0]).toBe(g[1]); // first pair beamed
    expect(g[2]).toBeNull(); // rest is never beamed
    expect(g[3]).toBe(g[4]); // second pair beamed together
    expect(g[0]).not.toBe(g[3]); // and it's a separate beam from the first
  });
});
