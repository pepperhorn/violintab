# MusicXML Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a MusicXML file (`.musicxml` / `.xml` / `.mxl`) into the workbench as editable shorthand plus header settings (instrument, key, time, tempo).

**Architecture:** Four pure modules under `src/lib/import/` — `parseDocument` (bytes → normalized score, via fflate + fast-xml-parser), `fingering` (pitch → string/finger/position solver), `toShorthand` (placed `Measure[]` → shorthand string), and `musicxml` (orchestrator) — plus an Import button in `TabWorkbench.tsx` that applies the result through existing state setters. Reuses the whole `parseTab → layout → render → playback` pipeline.

**Tech Stack:** TypeScript, Vitest, React (island). New runtime deps: `fflate`, `fast-xml-parser`.

## Global Constraints

- Path alias `@/*` → `src/*` (works in `tsconfig.json` and `vitest.config.ts`).
- Keep `src/lib/import/` free of React/DOM (unit-testable in node). All rendering stays in components. Use `fast-xml-parser`, never `DOMParser`.
- `noteToMidi(note, instrument)`, `parseTab(text, opts)`, `getInstrument(id)` already exist; reuse them, don't reimplement pitch logic.
- Instrument model: `Instrument` has `{ id, label, tuning[], openMidi[], patch, maxPosition, naturalFingerMidi }`. String index 1 = highest pitch. Cello's `naturalFingerMidi` is `{}` (stub) — its fingered notes are unsolvable by design.
- Importer never throws for musical content — collect `warnings[]`. Throw/return an error only for hard failures (not XML, not `<score-partwise>`, empty, unreadable `.mxl`).
- `vite` stays pinned to one version; after `npm install`, confirm `npm ls vite` shows a single version.
- `npx astro check` must stay at 0 errors; `npm test` green.

---

## Shared types (defined in Task 1, consumed everywhere)

Create `src/lib/import/types.ts` in Task 1 with these exact shapes:

```ts
import type { InstrumentId } from "@/lib/tab/types";

/** Public result the workbench applies to its state. */
export interface ImportResult {
  text: string;
  instrument: InstrumentId;
  keySig: string;
  timeSig: string;
  tempo: number;
  warnings: string[];
}

/** A hard failure that leaves the current tab untouched. */
export interface ImportError {
  error: string;
}

export type ImportOutcome = ImportResult | ImportError;

export function isImportError(o: ImportOutcome): o is ImportError {
  return (o as ImportError).error !== undefined;
}

/** Normalized MusicXML, format-ugliness removed (produced by parseDocument). */
export interface NormalizedScore {
  header: {
    keyFifths: number;
    keyMode?: "major" | "minor";
    beats: number;
    beatType: number;
    tempo?: number;
    instrumentHint?: InstrumentId;
    divisions: number;
  };
  measures: NormMeasure[];
  warnings: string[];
}

export interface NormMeasure {
  notes: NormNote[];
  repeatStart?: boolean;
  repeatEnd?: boolean;
  repeatCount?: number;
  doubleBarline?: boolean;
}

export interface NormNote {
  isRest: boolean;
  chord: boolean; // sounds with the previous note (double stop)
  pitchMidi?: number; // absent for rests
  type: "w" | "h" | "q" | "e" | "s";
  dots: number;
  triplet: boolean;
  tieStart: boolean;
  embed?: { stringNum?: number; finger?: number };
}
```

---

### Task 1: Fingering solver + shared types

**Files:**
- Create: `src/lib/import/types.ts` (the shapes above)
- Create: `src/lib/import/fingering.ts`
- Test: `src/lib/import/fingering.test.ts`

**Interfaces:**
- Consumes: `Instrument`, `ViolinNote`, `InstrumentId` from `@/lib/tab/types`; `noteToMidi`, `VIOLIN`/`CELLO` from `@/lib/tab`.
- Produces:
  - `buildPlacementIndex(instrument: Instrument): Map<number, Placement[]>`
  - `type Placement = { note: ViolinNote; position: number; string: number }`
  - `type Carried = { position: number; string: number }`
  - `assignFingering(midi: number, carried: Carried, index: Map<number, Placement[]>, embed?: NormNote["embed"]): { note: ViolinNote | null; carried: Carried }`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/import/fingering.test.ts
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

  it("returns null for an unsolvable pitch (empty cello chart, fingered note)", () => {
    const idx = buildPlacementIndex(CELLO);
    const cAopen = noteToMidi({ string: 1, finger: 0 }, CELLO); // 57
    expect(assignFingering(cAopen!, START, idx).note).toEqual({ string: 1, finger: 0 });
    // a fingered cello pitch (e.g. 60 = C4) has no placement
    expect(assignFingering(60, START, idx).note).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/import/fingering.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `types.ts`** — paste the "Shared types" block above into `src/lib/import/types.ts`.

- [ ] **Step 4: Implement `fingering.ts`**

```ts
// src/lib/import/fingering.ts
import { VIOLIN } from "@/lib/tab/instruments";
import { noteToMidi } from "@/lib/tab/pitch";
import type { Instrument, ViolinNote } from "@/lib/tab/types";
import type { NormNote } from "./types";

export interface Placement { note: ViolinNote; position: number; string: number }
export interface Carried { position: number; string: number }

// Scoring weights — tuned by the tests above. Position shift dominates.
const SHIFT_COST = 10;
const CROSS_COST = 2;
const OPEN_BONUS = 3;
const LEVEL_PENALTY = 1;

/** All reachable placements keyed by resulting MIDI: open strings (finger 0),
 *  and every (string, position, finger) natural plus its L/H neighbours. */
export function buildPlacementIndex(instrument: Instrument): Map<number, Placement[]> {
  const idx = new Map<number, Placement[]>();
  const add = (midi: number | null, note: ViolinNote, position: number, string: number) => {
    if (midi === null) return;
    const list = idx.get(midi) ?? [];
    list.push({ note, position, string });
    idx.set(midi, list);
  };

  for (let string = 1; string <= instrument.tuning.length; string++) {
    add(instrument.openMidi[string - 1] ?? null, { string, finger: 0 }, 1, string);
  }
  const letters = instrument.tuning;
  for (let s = 0; s < letters.length; s++) {
    const table = instrument.naturalFingerMidi[letters[s]];
    if (!table) continue;
    for (const posKey of Object.keys(table)) {
      const position = Number(posKey);
      for (let finger = 1; finger <= 4; finger++) {
        for (const level of [undefined, "L", "H"] as const) {
          const note: ViolinNote = { string: s + 1, finger };
          if (level) note.level = level;
          if (position > 1) note.position = position;
          add(noteToMidi(note, instrument), note, position, s + 1);
        }
      }
    }
  }
  return idx;
}

function score(p: Placement, carried: Carried): number {
  let c = SHIFT_COST * Math.abs(p.position - carried.position);
  if (p.string !== carried.string) c += CROSS_COST;
  if (p.note.finger === 0) c -= OPEN_BONUS;
  if (p.note.level) c += LEVEL_PENALTY;
  c += p.position * 0.1; // low-position tiebreak
  return c;
}

/** Pick a placement for `midi`. Honors a valid embedded string/finger; otherwise
 *  scores candidates and returns the cheapest, carrying position/string forward.
 *  Returns note: null when the pitch is unreachable on this instrument. */
export function assignFingering(
  midi: number,
  carried: Carried,
  index: Map<number, Placement[]>,
  embed?: NormNote["embed"],
): { note: ViolinNote | null; carried: Carried } {
  let candidates = index.get(midi) ?? [];
  if (candidates.length === 0) return { note: null, carried };

  if (embed?.stringNum) {
    const onString = candidates.filter((p) => p.string === embed.stringNum);
    if (onString.length) candidates = onString; // else: mis-numbered, fall through
  }
  if (embed?.finger !== undefined) {
    const byFinger = candidates.filter((p) => p.note.finger === embed.finger);
    if (byFinger.length) candidates = byFinger;
  }

  let best = candidates[0];
  let bestScore = score(best, carried);
  for (const p of candidates.slice(1)) {
    const s = score(p, carried);
    if (s < bestScore) { best = p; bestScore = s; }
  }
  return { note: { ...best.note }, carried: { position: best.position, string: best.string } };
}

export const DEFAULT_INDEX = buildPlacementIndex(VIOLIN);
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/import/fingering.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/types.ts src/lib/import/fingering.ts src/lib/import/fingering.test.ts
git commit -m "Add fingering solver + import types for MusicXML import"
```

---

### Task 2: MusicXML document parser (`parseDocument`)

**Files:**
- Create: `src/lib/import/musicxml/parseDocument.ts`
- Test: `src/lib/import/musicxml/parseDocument.test.ts`
- Modify: `package.json` (add `fflate`, `fast-xml-parser`)

**Interfaces:**
- Consumes: `NormalizedScore`, `NormMeasure`, `NormNote` from `../types`.
- Produces: `parseDocument(bytes: Uint8Array | string): NormalizedScore | { error: string }`

- [ ] **Step 1: Install deps**

```bash
npm install fflate fast-xml-parser
npm ls vite   # confirm a single vite version
```

- [ ] **Step 2: Write failing tests**

```ts
// src/lib/import/musicxml/parseDocument.test.ts
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
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/import/musicxml/parseDocument.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `parseDocument.ts`**

```ts
// src/lib/import/musicxml/parseDocument.ts
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type { InstrumentId } from "@/lib/tab/types";
import type { NormMeasure, NormNote, NormalizedScore } from "../types";

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const TYPE_MAP: Record<string, NormNote["type"]> = {
  whole: "w", half: "h", quarter: "q", eighth: "e", "16th": "s",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["part", "measure", "note", "dot", "score-part"].includes(name),
});

/** Decode bytes: .mxl (ZIP, magic "PK") → its rootfile; else UTF-8 text. */
function toXmlString(bytes: Uint8Array | string): string | { error: string } {
  if (typeof bytes === "string") return bytes;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      const files = unzipSync(bytes);
      const container = files["META-INF/container.xml"];
      let rootPath: string | undefined;
      if (container) {
        const c = parser.parse(strFromU8(container));
        rootPath = c?.container?.rootfiles?.rootfile?.["@_full-path"];
      }
      const path = rootPath && files[rootPath]
        ? rootPath
        : Object.keys(files).find((f) => f.endsWith(".xml") && !f.startsWith("META-INF"));
      if (!path || !files[path]) return { error: "No score found inside the .mxl archive." };
      return strFromU8(files[path]);
    } catch {
      return { error: "Could not read the .mxl archive." };
    }
  }
  return strFromU8(bytes);
}

const arr = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function noteMidi(pitch: Record<string, unknown>): number | undefined {
  const step = String(pitch.step ?? "");
  const pc = STEP_PC[step];
  const octave = num(pitch.octave);
  if (pc === undefined || octave === undefined) return undefined;
  const alter = num(pitch.alter) ?? 0;
  return (octave + 1) * 12 + pc + alter; // MIDI: C4 = 60
}

export function parseDocument(bytes: Uint8Array | string): NormalizedScore | { error: string } {
  const xml = toXmlString(bytes);
  if (typeof xml !== "string") return xml;

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch {
    return { error: "The file is not valid XML." };
  }
  if (doc["score-timewise"]) return { error: "Timewise MusicXML is not supported — re-export as partwise." };
  const score = doc["score-partwise"] as Record<string, unknown> | undefined;
  if (!score) return { error: "Not a MusicXML score (no <score-partwise>)." };

  const warnings: string[] = [];
  const parts = arr(score.part as never);
  if (parts.length === 0) return { error: "The score has no parts." };
  if (parts.length > 1) warnings.push(`Only the first of ${parts.length} parts was imported.`);

  // Instrument hint from the matching score-part name.
  const partList = arr((score["part-list"] as Record<string, unknown> | undefined)?.["score-part"] as never);
  const nameText = String(
    (partList[0] as Record<string, unknown> | undefined)?.["part-name"] ?? "",
  ).toLowerCase();
  const instrumentHint: InstrumentId | undefined = nameText.includes("cello")
    ? "cello"
    : nameText.includes("violin")
    ? "violin"
    : undefined;

  const header: NormalizedScore["header"] = {
    keyFifths: 0, beats: 4, beatType: 4, divisions: 1, instrumentHint,
  };
  let headerSeen = false;
  const measures: NormMeasure[] = [];

  for (const measure of arr((parts[0] as Record<string, unknown>).measure as never)) {
    const m = measure as Record<string, unknown>;
    const attrs = m.attributes as Record<string, unknown> | undefined;
    if (attrs) {
      const div = num(attrs.divisions);
      if (div) header.divisions = div;
      const key = attrs.key as Record<string, unknown> | undefined;
      if (key) {
        const f = num(key.fifths);
        if (f !== undefined) { header.keyFifths = f; headerSeen = true; }
        if (key.mode === "minor" || key.mode === "major") header.keyMode = key.mode;
      }
      const time = attrs.time as Record<string, unknown> | undefined;
      if (time) {
        header.beats = num(time.beats) ?? header.beats;
        header.beatType = num(time["beat-type"]) ?? header.beatType;
      }
    }
    // Tempo from a <direction><sound tempo> or <metronome> is best-effort.
    for (const dir of arr(m.direction as never)) {
      const sound = (dir as Record<string, unknown>).sound as Record<string, unknown> | undefined;
      const t = num(sound?.["@_tempo"]);
      if (t) header.tempo = t;
    }
    const sound = m.sound as Record<string, unknown> | undefined;
    if (num(sound?.["@_tempo"])) header.tempo = num(sound?.["@_tempo"]);

    const notes: NormNote[] = [];
    for (const rawNote of arr(m.note as never)) {
      const n = rawNote as Record<string, unknown>;
      if (n.grace !== undefined) { warnings.push("Grace notes were skipped."); continue; }
      const isRest = n.rest !== undefined;
      const type = TYPE_MAP[String(n.type ?? "")] ?? "q";
      if (!TYPE_MAP[String(n.type ?? "")]) warnings.push(`Unsupported note type "${n.type}" treated as quarter.`);
      const dots = arr(n.dot as never).length;
      if (dots > 1) warnings.push("Double-dotted notes were reduced to a single dot.");
      const tm = n["time-modification"] as Record<string, unknown> | undefined;
      const triplet = tm ? num(tm["actual-notes"]) === 3 && num(tm["normal-notes"]) === 2 : false;
      if (tm && !triplet) warnings.push("A non-triplet tuplet was approximated.");

      const tech = ((n.notations as Record<string, unknown> | undefined)?.technical) as
        Record<string, unknown> | undefined;
      const embed = tech
        ? { stringNum: num(tech.string), finger: num(tech.fingering) }
        : undefined;

      const ties = arr(n.tie as never).map((t) => (t as Record<string, unknown>)["@_type"]);

      notes.push({
        isRest,
        chord: n.chord !== undefined,
        pitchMidi: isRest ? undefined : noteMidi(n.pitch as Record<string, unknown>),
        type,
        dots: Math.min(dots, 1),
        triplet,
        tieStart: ties.includes("start"),
        embed: embed && (embed.stringNum || embed.finger !== undefined) ? embed : undefined,
      });
    }

    // Repeats + double barline from <barline>.
    const nm: NormMeasure = { notes };
    for (const b of arr(m.barline as never)) {
      const bar = b as Record<string, unknown>;
      const style = String(bar["bar-style"] ?? "");
      const repeat = bar.repeat as Record<string, unknown> | undefined;
      if (style === "light-light") nm.doubleBarline = true;
      if (repeat?.["@_direction"] === "forward") nm.repeatStart = true;
      if (repeat?.["@_direction"] === "backward") {
        nm.repeatEnd = true;
        const times = num(repeat["@_times"]);
        if (times && times > 1) nm.repeatCount = times;
      }
    }
    measures.push(nm);
  }

  if (!headerSeen) warnings.push("No key signature found; defaulted to C.");
  return { header, measures, warnings };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/import/musicxml/parseDocument.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/import/musicxml/parseDocument.ts src/lib/import/musicxml/parseDocument.test.ts
git commit -m "Add MusicXML document parser (fflate + fast-xml-parser)"
```

---

### Task 3: `toShorthand` serializer

**Files:**
- Create: `src/lib/import/toShorthand.ts`
- Test: `src/lib/import/toShorthand.test.ts`

**Interfaces:**
- Consumes: `Measure`, `Beat`, `ViolinNote`, `Duration` from `@/lib/tab/types`.
- Produces: `toShorthand(measures: Measure[]): string`

- [ ] **Step 1: Write failing tests (incl. the round-trip property)**

```ts
// src/lib/import/toShorthand.test.ts
import { describe, expect, it } from "vitest";
import { toShorthand } from "./toShorthand";
import { parseTab } from "@/lib/tab/parse";
import type { Measure } from "@/lib/tab/types";

const m = (beats: Measure["beats"], extra: Partial<Measure> = {}): Measure => ({
  beats, forcedBarline: true, ...extra,
});

describe("toShorthand", () => {
  it("emits duration prefixes only when they change", () => {
    const out = toShorthand([
      m([
        { notes: [{ string: 3, finger: 0 }], duration: "q", dotted: false, isRest: false },
        { notes: [{ string: 3, finger: 1 }], duration: "q", dotted: false, isRest: false },
        { notes: [{ string: 1, finger: 0 }], duration: "e", dotted: false, isRest: false },
      ]),
    ]);
    expect(out).toBe("q:d0 d1 e:e0");
  });

  it("emits double stops, positions, levels, rests, ties and barlines", () => {
    const out = toShorthand([
      m([
        { notes: [{ string: 1, finger: 1 }, { string: 2, finger: 2 }], duration: "q", dotted: false, isRest: false },
        { notes: [{ string: 2, finger: 2, level: "H", position: 3 }], duration: "q", dotted: false, isRest: false, tie: true },
        { notes: [], duration: "q", dotted: false, isRest: true },
      ], { doubleBarline: true }),
    ]);
    expect(out).toBe("q:e1:a2 (3)aH2 ~ r ||");
  });

  it("round-trips through parseTab", () => {
    const text = "q:d0 e:d1 d2 h:(3)e1 | q:a0:e0 aL2 r ||";
    const doc = parseTab(text, { keySig: "D", timeSig: { num: 4, den: 4 } });
    const back = parseTab(toShorthand(doc.measures), { keySig: "D", timeSig: { num: 4, den: 4 } });
    expect(back.measures).toEqual(doc.measures);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/import/toShorthand.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `toShorthand.ts`**

```ts
// src/lib/import/toShorthand.ts
import type { Duration, Measure, ViolinNote } from "@/lib/tab/types";

/** One note token: (P)?<string><L|H>?<finger>, string letter lowercased. */
function noteToken(n: ViolinNote, tuning: string[]): string {
  const letter = (tuning[n.string - 1] ?? "e").toLowerCase();
  const pos = n.position && n.position > 1 ? `(${n.position})` : "";
  return `${pos}${letter}${n.level ?? ""}${n.finger}`;
}

/** Duration prefix token, e.g. "q", "qd" (dotted), "et" (triplet eighth). */
function durToken(d: Duration, dotted: boolean): string {
  const triplet = d.endsWith("t");
  const base = triplet ? d.slice(0, -1) : d;
  return `${base}${dotted ? "d" : ""}${triplet ? "t" : ""}`;
}

/** Serialize placed measures to shorthand — the inverse of parseTab. Duration
 *  prefixes are dropped when unchanged from the previous beat (parseTab carries
 *  them forward). Tuning is fixed to the violin/cello letters via string index. */
export function toShorthand(measures: Measure[], tuning = ["E", "A", "D", "G"]): string {
  const tokens: string[] = [];
  let prevDur: string | null = null;
  measures.forEach((measure, mi) => {
    if (measure.repeatStart) tokens.push("|:");
    for (const beat of measure.beats) {
      const dur = durToken(beat.duration, beat.dotted);
      const body = beat.isRest ? "r" : beat.notes.map((n) => noteToken(n, tuning)).join(":");
      tokens.push(dur === prevDur ? body : `${dur}:${body}`);
      prevDur = dur;
      if (beat.tie) tokens.push("~");
    }
    if (measure.repeatEnd) tokens.push(measure.repeatCount ? `:|x${measure.repeatCount}` : ":|");
    else if (measure.doubleBarline) tokens.push("||");
    else if (mi < measures.length - 1) tokens.push("|");
  });
  return tokens.join(" ");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/import/toShorthand.test.ts`
Expected: PASS (3 tests). If the round-trip fails on tuning letters, pass the doc's tuning through.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/toShorthand.ts src/lib/import/toShorthand.test.ts
git commit -m "Add toShorthand serializer (inverse of parseTab)"
```

---

### Task 4: Orchestrator (`importMusicXml`)

**Files:**
- Create: `src/lib/import/musicxml.ts`
- Test: `src/lib/import/musicxml.test.ts`

**Interfaces:**
- Consumes: `parseDocument` (Task 2), `buildPlacementIndex`/`assignFingering`/`Carried` (Task 1), `toShorthand` (Task 3), `getInstrument` from `@/lib/tab/instruments`.
- Produces: `importMusicXml(bytes: Uint8Array | string, opts: { fallbackInstrument: InstrumentId }): ImportOutcome`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/import/musicxml.test.ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/import/musicxml.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `musicxml.ts`**

```ts
// src/lib/import/musicxml.ts
import { getInstrument } from "@/lib/tab/instruments";
import type { Beat, Duration, InstrumentId, Measure } from "@/lib/tab/types";
import { assignFingering, buildPlacementIndex, type Carried } from "./fingering";
import { parseDocument } from "./musicxml/parseDocument";
import { toShorthand } from "./toShorthand";
import type { ImportOutcome, NormNote, NormalizedScore } from "./types";

// fifths (major) -> key name; minor shifts by the relative-minor label.
const SHARP_MAJOR = ["C", "G", "D", "A", "E", "B", "F#", "C#"];
const FLAT_MAJOR = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"];
const SHARP_MINOR = ["A", "E", "B", "F#", "C#", "G#", "D#", "A#"];
const FLAT_MINOR = ["A", "D", "G", "C", "F", "Bb", "Eb", "Ab"];

function keyName(fifths: number, mode?: "major" | "minor"): string {
  const i = Math.abs(fifths);
  if (mode === "minor") {
    const n = fifths >= 0 ? SHARP_MINOR[i] : FLAT_MINOR[i];
    return `${n ?? "A"}m`;
  }
  return (fifths >= 0 ? SHARP_MAJOR[i] : FLAT_MAJOR[i]) ?? "C";
}

function duration(n: NormNote): Duration {
  return (n.triplet ? `${n.type}t` : n.type) as Duration;
}

export function importMusicXml(
  bytes: Uint8Array | string,
  opts: { fallbackInstrument: InstrumentId },
): ImportOutcome {
  const parsed = parseDocument(bytes);
  if ("error" in parsed) return parsed;
  const score: NormalizedScore = parsed;

  const instrumentId = score.header.instrumentHint ?? opts.fallbackInstrument;
  const instrument = getInstrument(instrumentId);
  const index = buildPlacementIndex(instrument);
  const warnings = [...score.warnings];

  let carried: Carried = { position: 1, string: 1 };
  let unfingered = 0;

  const measures: Measure[] = score.measures.map((nm) => {
    const beats: Beat[] = [];
    for (const n of nm.notes) {
      if (n.isRest) {
        beats.push({ notes: [], duration: duration(n), dotted: n.dots > 0, isRest: true });
        continue;
      }
      const midi = n.pitchMidi;
      let placement = midi === undefined ? { note: null, carried } : assignFingering(midi, carried, index, n.embed);
      carried = placement.carried;

      if (!placement.note) {
        unfingered++;
        // Chord continuation with no placement is dropped; a lead note becomes a rest.
        if (!n.chord) beats.push({ notes: [], duration: duration(n), dotted: n.dots > 0, isRest: true });
        continue;
      }
      if (n.chord && beats.length) {
        beats[beats.length - 1].notes.push(placement.note); // double stop on the previous beat
      } else {
        const beat: Beat = { notes: [placement.note], duration: duration(n), dotted: n.dots > 0, isRest: false };
        if (n.tieStart) beat.tie = true;
        beats.push(beat);
      }
    }
    const m: Measure = { beats, forcedBarline: true };
    if (nm.repeatStart) m.repeatStart = true;
    if (nm.repeatEnd) m.repeatEnd = true;
    if (nm.repeatCount) m.repeatCount = nm.repeatCount;
    if (nm.doubleBarline) m.doubleBarline = true;
    return m;
  });

  if (unfingered > 0) {
    warnings.push(
      `${unfingered} note(s) could not be fingered for ${instrument.label}` +
        (instrumentId === "cello" ? " — the cello fingering chart is not yet filled in." : "."),
    );
  }

  return {
    text: toShorthand(measures, [...instrument.tuning]),
    instrument: instrumentId,
    keySig: keyName(score.header.keyFifths, score.header.keyMode),
    timeSig: `${score.header.beats}/${score.header.beatType}`,
    tempo: score.header.tempo ?? 96,
    warnings,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/import/musicxml.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Full suite + type check**

Run: `npm test && npx astro check`
Expected: all green, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/musicxml.ts src/lib/import/musicxml.test.ts
git commit -m "Add importMusicXml orchestrator (normalize -> finger -> shorthand)"
```

---

### Task 5: Workbench Import button

**Files:**
- Modify: `src/components/TabWorkbench.tsx`

**Interfaces:**
- Consumes: `importMusicXml` (Task 4), `isImportError` from `@/lib/import/types`.
- Produces: UI only (no exported API).

- [ ] **Step 1: Add import state + handler**

In `TabWorkbench.tsx`, add the imports:

```ts
import { importMusicXml } from "@/lib/import/musicxml";
import { isImportError } from "@/lib/import/types";
```

Add state near the other `useState`s:

```ts
const [importWarnings, setImportWarnings] = useState<string[]>([]);
const [importError, setImportErrorMsg] = useState<string | null>(null);
const fileInputRef = useRef<HTMLInputElement | null>(null);
```

Add the handler (place beside `play`/`stop`):

```ts
const onImportFile = async (file: File) => {
  setImportError(null);
  setImportWarnings([]);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = importMusicXml(bytes, { fallbackInstrument: instrumentId });
  if (isImportError(result)) {
    setImportErrorMsg(result.error);
    return;
  }
  setInstrumentId(result.instrument);
  setText(result.text);
  setKeySig(result.keySig);
  setTimeSigStr(result.timeSig);
  setBpm(result.tempo);
  setImportWarnings(result.warnings);
};
```

(Rename the existing `exportError` setter usage is untouched; this adds a separate `importError` state. If the name `setImportError` collides, use `setImportErrorMsg` as above.)

- [ ] **Step 2: Add the button + hidden input + warnings UI**

In the Score Setup card's `toggles` row (next to the instrument toggle), add:

```tsx
<Button
  className="import-musicxml-btn"
  variant="outline"
  size="sm"
  onClick={() => fileInputRef.current?.click()}
>
  Import MusicXML
</Button>
<input
  ref={fileInputRef}
  type="file"
  accept=".musicxml,.xml,.mxl"
  className="hidden"
  onChange={(e) => {
    const f = e.target.files?.[0];
    if (f) void onImportFile(f);
    e.target.value = ""; // allow re-importing the same file
  }}
/>
```

Below the `toggles` row, add feedback:

```tsx
{importError && <div className="import-error text-xs text-red-600">{importError}</div>}
{importWarnings.length > 0 && (
  <div className="import-warnings text-xs text-amber-600 flex flex-col gap-0.5">
    {importWarnings.map((w, i) => (
      <div key={i}>⚠ {w}</div>
    ))}
    <button
      type="button"
      className="import-warnings-dismiss self-start underline"
      onClick={() => setImportWarnings([])}
    >
      dismiss
    </button>
  </div>
)}
```

- [ ] **Step 3: Type check + build**

Run: `npx astro check && npm run build`
Expected: 0 errors; build completes.

- [ ] **Step 4: Manual smoke (optional)**

Start `npm run dev -- --host 0.0.0.0`, click **Import MusicXML**, choose a `.musicxml` or `.mxl` file, confirm the editor fills, the staff renders, key/time/tempo/instrument update, and warnings show for anything skipped.

- [ ] **Step 5: Commit**

```bash
git add src/components/TabWorkbench.tsx
git commit -m "Add Import MusicXML button to the workbench"
```

---

## Self-Review notes

- **Spec coverage:** landing target (Task 5 applies setters), solver (Task 1), parse incl. `.mxl`/timewise/multi-part/chords/triplets/ties/embedded fingering (Task 2), toShorthand + round-trip (Task 3), key/time/tempo mapping + cello rest-out + warnings (Task 4), UI + warnings (Task 5). The `||` double barline the parser/renderer now supports is emitted by Task 3 and mapped in Task 2.
- **Deferred (spec §10, not in this plan):** multi-part/voice selection UI, MIDI import, phrase-level optimization, non-triplet tuplets, export to MusicXML, cello fingering chart.
- **Known simplifications to verify during execution:** fast-xml-parser groups same-named siblings, so a mid-measure `<attributes>`/`<barline>` interleave order is not preserved — fine for v1 single-voice melodies; note left/right via `<barline location>`. Dotted+triplet on the same note is not expressed (dots capped at 1). If the round-trip test in Task 3 reveals a tuning-letter mismatch, thread the doc's tuning into `toShorthand` (already parameterized).
