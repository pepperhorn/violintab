// src/lib/tab/pitch.test.ts
import { describe, expect, it } from "vitest";
import { NATURAL_FINGER_MIDI, keyUsesFlats, midiToNoteName, noteToMidi } from "./pitch";
import { CELLO, VIOLIN } from "./instruments";

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
    expect(noteToMidi({ string: A, finger: 2 })).toBe(73); // C#5 (high 2)
    expect(noteToMidi({ string: A, finger: 3 })).toBe(74); // D5
    expect(noteToMidi({ string: A, finger: 4 })).toBe(76); // E5
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
    expect(noteToMidi({ string: G, finger: 4, position: 4 })).toBe(67); // G4
  });

  it("returns null for an unsupported position", () => {
    expect(noteToMidi({ string: A, finger: 1, position: 9 })).toBeNull();
  });

  it("spells note names with sharps by default, flats for flat keys", () => {
    expect(midiToNoteName(73)).toBe("C#");
    expect(midiToNoteName(70)).toBe("A#");
    expect(midiToNoteName(73, true)).toBe("Db");
    expect(midiToNoteName(70, true)).toBe("Bb");
    expect(midiToNoteName(76, false, true)).toBe("E5");
    expect(midiToNoteName(60, false, true)).toBe("C4");
  });

  it("keyUsesFlats classifies keys", () => {
    expect(keyUsesFlats("Bb")).toBe(true);
    expect(keyUsesFlats("Dm")).toBe(true);
    expect(keyUsesFlats("D")).toBe(false);
    expect(keyUsesFlats("C")).toBe(false);
  });

  it("defaults to the violin when no instrument is passed", () => {
    expect(noteToMidi({ string: A, finger: 1 })).toBe(noteToMidi({ string: A, finger: 1 }, VIOLIN));
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

describe("noteToMidi on the cello", () => {
  // Cello string indices: 1=A, 2=D, 3=G, 4=C.
  const cA = 1, cD = 2, cG = 3, cC = 4;

  it("open strings sound the open pitch (A3 D3 G2 C2)", () => {
    expect(noteToMidi({ string: cA, finger: 0 }, CELLO)).toBe(57);
    expect(noteToMidi({ string: cD, finger: 0 }, CELLO)).toBe(50);
    expect(noteToMidi({ string: cG, finger: 0 }, CELLO)).toBe(43);
    expect(noteToMidi({ string: cC, finger: 0 }, CELLO)).toBe(36);
  });

  it("resolves fingered notes from the cello fingering chart", () => {
    // C string, 1st position: 1=D2 (38), 3=E2 (40), 4=F2 (41)
    expect(noteToMidi({ string: cC, finger: 1 }, CELLO)).toBe(38);
    expect(noteToMidi({ string: cC, finger: 3 }, CELLO)).toBe(40);
    expect(noteToMidi({ string: cC, finger: 4 }, CELLO)).toBe(41);
    // A string, 1st position: 1=B3 (59), 4=D4 (62)
    expect(noteToMidi({ string: cA, finger: 1 }, CELLO)).toBe(59);
    expect(noteToMidi({ string: cA, finger: 4 }, CELLO)).toBe(62);
    // higher position: D string, 3rd position, 4th finger = B3 (59)
    expect(noteToMidi({ string: cD, finger: 4, position: 3 }, CELLO)).toBe(59);
    // three-finger positions (5-7): A string 7th position 1st finger = A4 (69),
    // the octave above open A3
    expect(noteToMidi({ string: cA, finger: 1, position: 7 }, CELLO)).toBe(69);
    // C string 5th position 1st finger = A2 (45)
    expect(noteToMidi({ string: cC, finger: 1, position: 5 }, CELLO)).toBe(45);
  });

  it("L/H shift a cello finger a semitone", () => {
    // C string 1st-position 1st finger: natural D2 (38), low Db2 (37), high Eb2 (39)
    expect(noteToMidi({ string: cC, finger: 1, level: "L" }, CELLO)).toBe(37);
    expect(noteToMidi({ string: cC, finger: 1, level: "H" }, CELLO)).toBe(39);
  });

  it("returns null beyond the charted range (positions 1-7)", () => {
    expect(noteToMidi({ string: cA, finger: 4, position: 8 }, CELLO)).toBeNull();
  });

  it("the cello chart is strictly ascending per row", () => {
    for (const str of Object.keys(CELLO.naturalFingerMidi)) {
      for (const pos of Object.keys(CELLO.naturalFingerMidi[str])) {
        const row = CELLO.naturalFingerMidi[str][Number(pos)];
        for (let i = 1; i < row.length; i++) {
          expect(row[i]).toBeGreaterThan(row[i - 1]);
        }
      }
    }
  });
});
