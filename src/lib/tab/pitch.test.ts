// src/lib/tab/pitch.test.ts
import { describe, expect, it } from "vitest";
import { NATURAL_FINGER_MIDI, noteToMidi } from "./pitch";

// String indices: 1=E, 2=A, 3=D, 4=G
const E = 1, A = 2, D = 3, G = 4;

describe("noteToMidi", () => {
  it("open strings sound the open pitch (E5 A4 D4 G3)", () => {
    expect(noteToMidi({ string: E, finger: 0 })).toBe(76);
    expect(noteToMidi({ string: A, finger: 0 })).toBe(69);
    expect(noteToMidi({ string: D, finger: 0 })).toBe(62);
    expect(noteToMidi({ string: G, finger: 0 })).toBe(55);
  });

  it("ignores position/level on an open string", () => {
    expect(noteToMidi({ string: A, finger: 0, position: 3 })).toBe(69);
  });

  it("natural fingers on the A string, 1st position", () => {
    expect(noteToMidi({ string: A, finger: 1 })).toBe(71); // B4
    expect(noteToMidi({ string: A, finger: 2 })).toBe(73); // C#5
    expect(noteToMidi({ string: A, finger: 3 })).toBe(75); // D#5
    expect(noteToMidi({ string: A, finger: 4 })).toBe(77); // F5
  });

  it("low/high fingerings shift a semitone", () => {
    expect(noteToMidi({ string: A, finger: 1, level: "L" })).toBe(70); // Bb4
    expect(noteToMidi({ string: A, finger: 1, level: "H" })).toBe(72); // C5
    expect(noteToMidi({ string: A, finger: 2, level: "L" })).toBe(72); // C5 (= aH1)
  });

  it("aH1 and aL2 resolve to the same pitch (C5)", () => {
    const aH1 = noteToMidi({ string: A, finger: 1, level: "H" });
    const aL2 = noteToMidi({ string: A, finger: 2, level: "L" });
    expect(aH1).toBe(72);
    expect(aL2).toBe(72);
  });

  it("higher positions use the lookup table", () => {
    expect(noteToMidi({ string: A, finger: 1, position: 3 })).toBe(74); // D5
    expect(noteToMidi({ string: A, finger: 4, position: 3 })).toBe(79); // G5
    expect(noteToMidi({ string: E, finger: 1, position: 1 })).toBe(78); // F#5
    expect(noteToMidi({ string: G, finger: 4, position: 5 })).toBe(69); // A4
  });

  it("returns null for an unsupported position", () => {
    expect(noteToMidi({ string: A, finger: 1, position: 9 })).toBeNull();
  });

  it("the lookup table is strictly ascending per row", () => {
    for (const str of Object.keys(NATURAL_FINGER_MIDI) as (keyof typeof NATURAL_FINGER_MIDI)[]) {
      for (const pos of Object.keys(NATURAL_FINGER_MIDI[str])) {
        const row = NATURAL_FINGER_MIDI[str][Number(pos)];
        for (let i = 1; i < row.length; i++) {
          expect(row[i]).toBeGreaterThan(row[i - 1]);
        }
      }
    }
  });
});
