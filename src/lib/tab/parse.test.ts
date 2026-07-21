// src/lib/tab/parse.test.ts
import { describe, expect, it } from "vitest";
import { parseBarToken, parseNote, parseTab } from "./parse";
import { CELLO } from "./instruments";
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

  it("records an explicit (1) so it can reset a sticky position", () => {
    expect(parseNote("(1)e1")).toEqual({ string: 1, finger: 1, position: 1 });
  });

  it("omits position on a bare note (inherits at parseTab level)", () => {
    expect(parseNote("e1")).toEqual({ string: 1, finger: 1 });
  });

  it("rejects a level on an open string", () => {
    expect(parseNote("eL0")).toEqual({ error: expect.stringContaining("open string") });
  });

  it("rejects an out-of-range position", () => {
    expect(parseNote("(4)e1")).toEqual({ string: 1, finger: 1, position: 4 }); // max
    expect(parseNote("(5)e1")).toEqual({ error: expect.stringContaining("out of range") });
    expect(parseNote("(9)e1")).toEqual({ error: expect.stringContaining("out of range") });
  });

  it("returns null for non-note text", () => {
    expect(parseNote("zz")).toBeNull();
    expect(parseNote("e5")).toBeNull(); // finger 5 not allowed
    expect(parseNote("q")).toBeNull();
    expect(parseNote("b1")).toBeNull(); // b isn't a violin string letter
  });
});

describe("parseNote on the cello", () => {
  it("reads the cello's own string letters (a d g c)", () => {
    expect(parseNote("c1", CELLO)).toEqual({ string: 4, finger: 1 });
    expect(parseNote("g0", CELLO)).toEqual({ string: 3, finger: 0 });
    expect(parseNote("a2", CELLO)).toEqual({ string: 1, finger: 2 });
  });

  it("rejects the violin-only E string", () => {
    expect(parseNote("e1", CELLO)).toBeNull();
  });

  it("supports the charted positions and rejects those beyond them (1-4)", () => {
    expect(parseNote("(4)c1", CELLO)).toEqual({ string: 4, finger: 1, position: 4 });
    expect(parseNote("(5)c1", CELLO)).toEqual({ error: expect.stringContaining("out of range") });
  });
});

describe("parseTab on the cello", () => {
  it("stamps the instrument, tuning and string count onto the doc", () => {
    const doc = parseTab("q:c0 q:g1 q:d2 q:a3", { keySig: "C", timeSig: TS, instrument: CELLO });
    expect(doc.errors).toEqual([]);
    expect(doc.instrument).toBe("cello");
    expect(doc.tuning).toEqual(["A", "D", "G", "C"]);
    expect(doc.stringCount).toBe(4);
    expect(doc.measures[0].beats[0].notes).toEqual([{ string: 4, finger: 0 }]);
  });

  it("defaults to the violin instrument when none is given", () => {
    expect(parse("q:e0").instrument).toBe("violin");
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

  it("marks a tie on the beat before a ~ token", () => {
    const doc = parse("q:e1 ~ q:e1");
    expect(doc.errors).toEqual([]);
    const beats = doc.measures.flatMap((m) => m.beats);
    expect(beats[0].tie).toBe(true);
    expect(beats[1].tie).toBeUndefined();
  });

  it("errors on a tie with no preceding note", () => {
    const doc = parse("~ q:e1");
    expect(doc.errors.some((e) => e.message.includes("no preceding note"))).toBe(true);
  });

  it("records a position on a positioned note", () => {
    const doc = parse("q:(3)e1");
    expect(doc.measures[0].beats[0].notes[0]).toEqual({ string: 1, finger: 1, position: 3 });
  });

  it("inherits a set position across later bare notes (sticky)", () => {
    const doc = parse("q:(3)e1 q:e2 q:e1");
    const positions = doc.measures[0].beats.map((b) => b.notes[0].position);
    expect(positions).toEqual([3, 3, 3]);
  });

  it("keeps the sticky position across barlines", () => {
    const doc = parse("q:(3)e1 q:e2 q:e3 q:e4 | q:e1 q:e2 q:e3 q:e4");
    const first = doc.measures[0].beats.map((b) => b.notes[0].position);
    const second = doc.measures[1].beats.map((b) => b.notes[0].position);
    expect(first).toEqual([3, 3, 3, 3]);
    expect(second).toEqual([3, 3, 3, 3]);
  });

  it("an explicit (1) resets a sticky position back to first", () => {
    const doc = parse("q:(3)e1 q:e2 q:(1)e1 q:e2");
    const positions = doc.measures[0].beats.map((b) => b.notes[0].position);
    expect(positions).toEqual([3, 3, 1, undefined]);
  });

  it("shifts the sticky position again on a new (P)", () => {
    const doc = parse("q:(2)e1 q:(4)e1 q:e2");
    const positions = doc.measures[0].beats.map((b) => b.notes[0].position);
    expect(positions).toEqual([2, 4, 4]);
  });

  it("defaults to first position (no position field) until one is set", () => {
    const doc = parse("q:e1 q:e2");
    const positions = doc.measures[0].beats.map((b) => b.notes[0].position);
    expect(positions).toEqual([undefined, undefined]);
  });

  it("does not advance the sticky position when a beat fails to parse", () => {
    // The middle beat carries an explicit (4) but a bad segment drops it; the
    // trailing bare note must NOT inherit the discarded beat's position.
    const doc = parse("q:e1 q:(4)e1:zz q:e2");
    expect(doc.errors).toHaveLength(1);
    const positions = doc.measures[0].beats.map((b) => b.notes[0].position);
    expect(positions).toEqual([undefined, undefined]); // both stay in first position
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

  it("marks forward and backward repeats on the right measures", () => {
    const doc = parse("|: q:e0 q:e1 q:e2 q:e3 :| q:a0");
    expect(doc.errors).toEqual([]);
    expect(doc.measures[0].repeatStart).toBe(true);
    expect(doc.measures[0].repeatEnd).toBe(true);
    expect(doc.measures[1].repeatStart).toBeUndefined();
  });

  it("spans a repeat across several measures", () => {
    const doc = parse("|: q:e0 q:e1 q:e2 q:e3 | q:a0 a1 a2 a3 :|");
    expect(doc.measures[0].repeatStart).toBe(true);
    expect(doc.measures[0].repeatEnd).toBeUndefined();
    expect(doc.measures[1].repeatStart).toBeUndefined();
    expect(doc.measures[1].repeatEnd).toBe(true);
  });

  it("reads a repeat play-count", () => {
    const doc = parse("|: q:e0 q:e1 q:e2 q:e3 :|x3");
    expect(doc.measures[0].repeatEnd).toBe(true);
    expect(doc.measures[0].repeatCount).toBe(3);
  });

  it("supports a back-to-back end+start repeat (:|:)", () => {
    const doc = parse("|: q:e0 q:e1 q:e2 q:e3 :|: q:a0 a1 a2 a3 :|");
    expect(doc.measures[0].repeatEnd).toBe(true);
    expect(doc.measures[1].repeatStart).toBe(true);
    expect(doc.measures[1].repeatEnd).toBe(true);
  });

  it("marks a double barline on the measure it closes", () => {
    const doc = parse("q:e0 q:e1 q:e2 q:e3 || q:a0 a1 a2 a3");
    expect(doc.errors).toEqual([]);
    expect(doc.measures[0].doubleBarline).toBe(true);
    expect(doc.measures[1].doubleBarline).toBeUndefined();
  });

  it("attaches a double barline placed right after a plain barline to the previous measure", () => {
    const doc = parse("q:e0 q:e1 q:e2 q:e3 | ||");
    expect(doc.errors).toEqual([]);
    expect(doc.measures).toHaveLength(1);
    expect(doc.measures[0].doubleBarline).toBe(true);
  });
});

describe("parseBarToken", () => {
  it("recognises the barline and repeat tokens", () => {
    expect(parseBarToken("|")).toEqual({});
    expect(parseBarToken("||")).toEqual({ double: true });
    expect(parseBarToken("|:")).toEqual({ start: true });
    expect(parseBarToken(":|")).toEqual({ end: true, count: undefined });
    expect(parseBarToken(":|:")).toEqual({ start: true, end: true });
    expect(parseBarToken(":|x3")).toEqual({ end: true, count: 3 });
    expect(parseBarToken(":|2")).toEqual({ end: true, count: 2 });
  });

  it("returns null for non-barline tokens", () => {
    expect(parseBarToken("q:e1")).toBeNull();
    expect(parseBarToken("e0")).toBeNull();
  });
});
