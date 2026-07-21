import { describe, expect, it } from "vitest";
import { parseDocument } from "./parseDocument";

const XML = (body: string) =>
  `<?xml version="1.0"?><score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <part id="P1">${body}</part></score-partwise>`;

const MEASURE1 = `<measure number="1">
  <attributes><divisions>1</divisions>
    <key><fifths>2</fifths><mode>major</mode></key>
    <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
  <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
  <note><rest/><duration>1</duration><type>quarter</type></note>
  <note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch><duration>1</duration><type>quarter</type>
    <notations><technical><string>2</string><fingering>2</fingering></technical></notations></note>
  <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
  <barline location="right"><bar-style>light-light</bar-style></barline>
</measure>`;

describe("parseDocument", () => {
  it("errors on non-MusicXML", () => {
    const r = parseDocument("<html></html>");
    expect("error" in r).toBe(true);
  });

  it("reads header, notes, rest, embedded fingering and double barline", () => {
    const r = parseDocument(XML(MEASURE1));
    if ("error" in r) throw new Error(r.error);
    expect(r.header.keyFifths).toBe(2);
    expect(r.header.keyMode).toBe("major");
    expect(r.header.beats).toBe(4);
    expect(r.header.beatType).toBe(4);
    expect(r.header.instrumentHint).toBe("violin");
    const m = r.measures[0];
    expect(m.notes).toHaveLength(4);
    expect(m.notes[0].pitchMidi).toBe(69); // A4
    expect(m.notes[1].isRest).toBe(true);
    expect(m.notes[2].embed).toEqual({ stringNum: 2, finger: 2 });
    expect(m.notes[2].pitchMidi).toBe(73); // C#5
    expect(m.doubleBarline).toBe(true);
  });

  it("marks a chord note and a triplet", () => {
    const body = `<measure number="1"><attributes><divisions>2</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><chord/><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
    </measure>`;
    const r = parseDocument(XML(body));
    if ("error" in r) throw new Error(r.error);
    expect(r.measures[0].notes[1].chord).toBe(true);
    expect(r.measures[0].notes[2].triplet).toBe(true);
    expect(r.measures[0].notes[2].type).toBe("e");
  });
});
