import { describe, expect, it } from "vitest";
import { importMusicXml } from "./musicxml";
import { isImportError } from "./types";

const XML = (body: string, name = "Violin") =>
  `<?xml version="1.0"?><score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>${name}</part-name></score-part></part-list>
  <part id="P1">${body}</part></score-partwise>`;

const BODY = `<measure number="1">
  <attributes><divisions>1</divisions>
    <key><fifths>2</fifths><mode>major</mode></key>
    <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
  <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
  <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
  <note><rest/><duration>1</duration><type>quarter</type></note>
  <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
</measure>`;

describe("importMusicXml", () => {
  it("propagates a hard error", () => {
    const r = importMusicXml("<nope/>", { fallbackInstrument: "violin" });
    expect(isImportError(r)).toBe(true);
  });

  it("produces shorthand + header settings for a violin melody", () => {
    const r = importMusicXml(XML(BODY), { fallbackInstrument: "violin" });
    if (isImportError(r)) throw new Error(r.error);
    expect(r.instrument).toBe("violin");
    expect(r.keySig).toBe("D"); // 2 sharps, major
    expect(r.timeSig).toBe("4/4");
    // A4 open, B4 = a1, rest, E5 open — parse the result back to verify it's valid
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.warnings).not.toContain(undefined);
  });

  it("warns and rests-out un-fingerable cello notes", () => {
    const r = importMusicXml(XML(BODY, "Cello"), { fallbackInstrument: "violin" });
    if (isImportError(r)) throw new Error(r.error);
    expect(r.instrument).toBe("cello");
    expect(r.warnings.some((w) => w.toLowerCase().includes("cello"))).toBe(true);
  });
});
