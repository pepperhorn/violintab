import { describe, expect, it } from "vitest";
import { assignFingering, buildPlacementIndex, type Carried } from "./fingering";
import { CELLO, VIOLIN } from "@/lib/tab/instruments";
import { noteToMidi } from "@/lib/tab/pitch";

const START: Carried = { position: 1, string: 1 };
const vio = () => buildPlacementIndex(VIOLIN);

describe("buildPlacementIndex", () => {
  it("indexes every natural finger pitch plus open strings", () => {
    const idx = vio();
    // open A string = 69, natural a1 = 71 (B4)
    expect(idx.has(69)).toBe(true);
    expect(idx.has(71)).toBe(true);
    // every placement round-trips through noteToMidi
    for (const [midi, places] of idx) {
      for (const p of places) expect(noteToMidi(p.note, VIOLIN)).toBe(midi);
    }
  });
});

describe("assignFingering", () => {
  it("prefers an open string when available", () => {
    const { note } = assignFingering(69, START, vio()); // A4 = open A
    expect(note).toEqual({ string: 2, finger: 0 });
  });

  it("resolves a fingered pitch to a valid placement", () => {
    const { note } = assignFingering(71, START, vio()); // B4 -> a1
    expect(note && noteToMidi(note, VIOLIN)).toBe(71);
  });

  it("stays in the current position when it can", () => {
    const idx = vio();
    let carried: Carried = { position: 3, string: 2 };
    // D5 (74) is reachable in 3rd position on the A string (a1@3)
    const r = assignFingering(74, carried, idx);
    expect(r.note && noteToMidi(r.note, VIOLIN)).toBe(74);
    expect(r.carried.position).toBe(3); // did not jump back to 1st
  });

  it("honors an embedded string+finger", () => {
    const idx = vio();
    // force finger 1 on the E string for F#5 (78)
    const { note } = assignFingering(78, START, idx, { stringNum: 1, finger: 1 });
    expect(note).toEqual({ string: 1, finger: 1 });
  });

  it("ignores a mis-numbered embedded string and falls back to the solver", () => {
    const idx = vio();
    // stringNum 4 (G) cannot produce E5 (76); solver must still return a valid placement
    const { note } = assignFingering(76, START, idx, { stringNum: 4 });
    expect(note && noteToMidi(note, VIOLIN)).toBe(76);
  });

  it("resolves in-range cello pitches and returns null beyond the charted range", () => {
    const idx = buildPlacementIndex(CELLO);
    const cAopen = noteToMidi({ string: 1, finger: 0 }, CELLO); // 57 (open A)
    expect(assignFingering(cAopen!, START, idx).note).toEqual({ string: 1, finger: 0 });
    // C4 (60) is reachable now that the chart is filled (e.g. D string, 4th position)
    expect(assignFingering(60, START, idx).note).not.toBeNull();
    // a pitch well above the cello's charted range has no placement
    expect(assignFingering(84, START, idx).note).toBeNull(); // C6
  });

  it("returns null when excludeStrings covers the only reachable string", () => {
    const idx = vio();
    // open G (55) is only reachable on string 4
    const { note } = assignFingering(55, START, idx, undefined, new Set([4]));
    expect(note).toBeNull();
  });

  it("picks a different string when the default choice is excluded", () => {
    const idx = vio();
    // B4 (71) is reachable on string 2 (A, pos1 finger1) and string 3 (D, pos2 finger4);
    // starting carried at {position:1, string:2} the solver would normally pick string 2.
    const carried: Carried = { position: 1, string: 2 };
    const unexcluded = assignFingering(71, carried, idx);
    expect(unexcluded.note?.string).toBe(2);

    const excluded = assignFingering(71, carried, idx, undefined, new Set([2]));
    expect(excluded.note).not.toBeNull();
    expect(excluded.note?.string).toBe(3);
    expect(noteToMidi(excluded.note!, VIOLIN)).toBe(71);
  });
});
