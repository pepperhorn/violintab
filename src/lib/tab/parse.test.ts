// src/lib/tab/parse.test.ts
import { describe, expect, it } from "vitest";
import { parseNote, parseTab } from "./parse";
import type { TimeSig } from "./types";

const TS: TimeSig = { num: 4, den: 4 };
const parse = (text: string) => parseTab(text, { keySig: "D", timeSig: TS });

describe("parseNote", () => {
  it("reads a plain string+finger note", () => {
    expect(parseNote("e1")).toEqual({ string: 1, finger: 1 });
    expect(parseNote("g0")).toEqual({ string: 4, finger: 0 });
    expect(parseNote("d3")).toEqual({ string: 3, finger: 3 });
  });

  it("is case-insensitive on the string letter", () => {
    expect(parseNote("A2")).toEqual({ string: 2, finger: 2 });
  });

  it("reads low/high fingerings", () => {
    expect(parseNote("eL1")).toEqual({ string: 1, finger: 1, level: "L" });
    expect(parseNote("eh1")).toEqual({ string: 1, finger: 1, level: "H" });
    expect(parseNote("dH3")).toEqual({ string: 3, finger: 3, level: "H" });
  });

  it("reads a position prefix", () => {
    expect(parseNote("(3)e1")).toEqual({ string: 1, finger: 1, position: 3 });
    expect(parseNote("(2)aH2")).toEqual({ string: 2, finger: 2, level: "H", position: 2 });
  });

  it("omits position when it is the default (1)", () => {
    expect(parseNote("(1)e1")).toEqual({ string: 1, finger: 1 });
  });

  it("rejects a level on an open string", () => {
    expect(parseNote("eL0")).toEqual({ error: expect.stringContaining("open string") });
  });

  it("rejects an out-of-range position", () => {
    expect(parseNote("(9)e1")).toEqual({ error: expect.stringContaining("out of range") });
  });

  it("returns null for non-note text", () => {
    expect(parseNote("zz")).toBeNull();
    expect(parseNote("e5")).toBeNull(); // finger 5 not allowed
    expect(parseNote("q")).toBeNull();
  });
});

describe("parseTab", () => {
  it("parses a simple line of quarter notes", () => {
    const doc = parse("q:e0 q:e1 q:a2 q:d3");
    expect(doc.errors).toEqual([]);
    expect(doc.measures).toHaveLength(1);
    const beats = doc.measures[0].beats;
    expect(beats).toHaveLength(4);
    expect(beats[0].notes).toEqual([{ string: 1, finger: 0 }]);
    expect(beats[2].notes).toEqual([{ string: 2, finger: 2 }]);
  });

  it("carries the duration prefix forward (sticky)", () => {
    const doc = parse("e:e0 e1 e2");
    const beats = doc.measures[0]?.beats ?? doc.measures.flatMap((m) => m.beats);
    expect(beats.every((b) => b.duration === "e")).toBe(true);
  });

  it("supports dotted and triplet durations", () => {
    const doc = parse("qd:e0 et:a1");
    const beats = doc.measures.flatMap((m) => m.beats);
    expect(beats[0]).toMatchObject({ duration: "q", dotted: true });
    expect(beats[1]).toMatchObject({ duration: "et", dotted: false });
  });

  it("parses a double stop", () => {
    const doc = parse("q:e0:a3");
    const beat = doc.measures[0].beats[0];
    expect(beat.notes).toEqual([
      { string: 1, finger: 0 },
      { string: 2, finger: 3 },
    ]);
  });

  it("attaches a chord label to the next beat", () => {
    const doc = parse("[Am] q:e1");
    expect(doc.measures[0].beats[0].chord).toEqual({ label: "Am" });
  });

  it("handles rests, repeats, and explicit barlines", () => {
    const doc = parse("q:e1 x q:r | q:a0");
    expect(doc.errors).toEqual([]);
    const m0 = doc.measures[0].beats;
    expect(m0[1].notes).toEqual(m0[0].notes); // repeat copies the previous beat
    expect(m0[2].isRest).toBe(true);
    expect(doc.measures[0].forcedBarline).toBe(true);
    expect(doc.measures[1].beats[0].notes).toEqual([{ string: 2, finger: 0 }]);
  });

  it("records a position on a positioned note", () => {
    const doc = parse("q:(3)e1");
    expect(doc.measures[0].beats[0].notes[0]).toEqual({ string: 1, finger: 1, position: 3 });
  });

  it("reports an error for an unreadable token", () => {
    const doc = parse("q:zz");
    expect(doc.errors).toHaveLength(1);
    expect(doc.errors[0].message).toContain("couldn't read");
  });

  it("reports an error for a dangling chord label", () => {
    const doc = parse("q:e1 [Am]");
    expect(doc.errors.some((e) => e.message.includes("no following note"))).toBe(true);
  });
});
