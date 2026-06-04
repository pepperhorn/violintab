// src/lib/tab/durations.test.ts
import { describe, expect, it } from "vitest";
import {
  DURATION_FRACTION,
  beatFraction,
  measureCapacity,
  parseDurationToken,
} from "./durations";

describe("durations", () => {
  it("fraction of a whole note per duration", () => {
    expect(DURATION_FRACTION.w).toBeCloseTo(1);
    expect(DURATION_FRACTION.q).toBeCloseTo(1 / 4);
    expect(DURATION_FRACTION.e).toBeCloseTo(1 / 8);
    expect(DURATION_FRACTION.et).toBeCloseTo(1 / 12);
    expect(DURATION_FRACTION.st).toBeCloseTo(1 / 24);
  });

  it("dotted adds half again", () => {
    expect(beatFraction("q", true)).toBeCloseTo(3 / 8);
    expect(beatFraction("e", false)).toBeCloseTo(1 / 8);
  });

  it("measure capacity = num/den", () => {
    expect(measureCapacity({ num: 4, den: 4 })).toBeCloseTo(1);
    expect(measureCapacity({ num: 6, den: 8 })).toBeCloseTo(0.75);
  });

  it("parses shorthand duration tokens", () => {
    expect(parseDurationToken("q")).toEqual({ duration: "q", dotted: false });
    expect(parseDurationToken("ed")).toEqual({ duration: "e", dotted: true });
    expect(parseDurationToken("et")).toEqual({ duration: "et", dotted: false });
    expect(parseDurationToken("std")).toEqual({ duration: "st", dotted: true });
  });

  it("parses spelled-out duration tokens", () => {
    expect(parseDurationToken("eighth")).toEqual({ duration: "e", dotted: false });
    expect(parseDurationToken("dotted-eighth")).toEqual({ duration: "e", dotted: true });
    expect(parseDurationToken("eighth-triplet")).toEqual({ duration: "et", dotted: false });
  });

  it("returns null for non-durations (notes, junk)", () => {
    expect(parseDurationToken("5/2")).toBeNull();
    expect(parseDurationToken("zz")).toBeNull();
    expect(parseDurationToken("")).toBeNull();
  });
});
