// src/lib/tab/playback.test.ts
import { describe, expect, it } from "vitest";
import { buildSchedule } from "./playback";
import { parseTab } from "./parse";
import type { TimeSig } from "./types";

const TS: TimeSig = { num: 4, den: 4 };
const sched = (text: string, bpm = 60) => buildSchedule(parseTab(text, { keySig: "D", timeSig: TS }), bpm);

describe("buildSchedule", () => {
  it("places beats end to end (quarter = 1s at 60bpm)", () => {
    const s = sched("q:e0 q:a0");
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ atSec: 0, durSec: 1 });
    expect(s[1]).toMatchObject({ atSec: 1, durSec: 1 });
    expect(s[0].onsets).toEqual([{ midi: 76, durSec: 1 }]); // open E = 76
    expect(s[1].onsets).toEqual([{ midi: 69, durSec: 1 }]); // open A = 69
  });

  it("sustains a tied note and suppresses the continuation onset", () => {
    const s = sched("q:e0 ~ q:e0");
    expect(s[0].onsets).toEqual([{ midi: 76, durSec: 2 }]); // 1s + 1s combined
    expect(s[1].onsets).toEqual([]); // not re-articulated
    expect(s[1].atSec).toBe(1); // cursor still advances per beat
  });

  it("sums a chain of ties", () => {
    const s = sched("q:e0 ~ q:e0 ~ q:e0");
    expect(s[0].onsets).toEqual([{ midi: 76, durSec: 3 }]);
    expect(s[1].onsets).toEqual([]);
    expect(s[2].onsets).toEqual([]);
  });

  it("does not sustain when the next note is a different pitch", () => {
    const s = sched("q:e0 ~ q:a0");
    expect(s[0].onsets).toEqual([{ midi: 76, durSec: 1 }]); // no merge
    expect(s[1].onsets).toEqual([{ midi: 69, durSec: 1 }]);
  });

  it("ties only the matching string of a double stop", () => {
    const s = sched("q:e0:a0 ~ q:e0");
    // E sustains across (76, 2s); A sounds once (69, 1s); next E is the continuation.
    expect(s[0].onsets).toContainEqual({ midi: 76, durSec: 2 });
    expect(s[0].onsets).toContainEqual({ midi: 69, durSec: 1 });
    expect(s[1].onsets).toEqual([]);
  });
});
