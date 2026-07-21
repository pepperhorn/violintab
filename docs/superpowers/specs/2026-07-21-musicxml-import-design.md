# MusicXML Import — Design

**Date:** 2026-07-21
**Status:** Approved (design), pending implementation plan
**Related:** `2026-06-04-violin-tab-writer-design.md` (the base tab writer),
the instrument abstraction (`src/lib/tab/instruments.ts`).

## 1. Goal

Let a user import a MusicXML file and have it land in the workbench as an
editable tab: the shorthand editor is populated and the header controls
(instrument, key, time, tempo) are set. Everything downstream (parse → layout →
render → playback) then works unchanged.

MusicXML is chosen over MIDI because it is already *notated* music — it carries
explicit durations, dots, tuplets, measures, ties, chords, key and time — so the
hardest part of a MIDI importer (quantizing raw ticks into a discrete rhythm and
barring it) disappears. What remains is choosing a fingering for each pitch,
which MusicXML sometimes provides directly and otherwise we solve.

## 2. Where an import lands

The app's only input today is the shorthand `<textarea>`; everything derives
from it via `parseTab`. Key/time/tempo/instrument are separate UI controls, not
shorthand tokens.

**Decision: an import produces shorthand text plus header settings, applied to
the existing workbench state.** The importer returns:

```ts
interface ImportResult {
  text: string;            // shorthand for the editor
  instrument: InstrumentId;
  keySig: string;          // e.g. "D", "Bb", "Am"
  timeSig: string;         // e.g. "4/4"
  tempo: number;           // bpm
  warnings: string[];      // best-effort content issues (never throws for these)
}
```

The workbench applies it with the existing setters (`setText`, `setKeySig`,
`setTimeSigStr`, `setBpm`, `setInstrumentId`). Rejected alternative: emit raw
`TabDoc` JSON via a new ingest path — that would bypass the shorthand parser,
leave the editor out of sync, and make imports non-editable. Shorthand-plus-
settings reuses the whole pipeline and stays hand-editable.

## 3. Architecture

Four new pure modules under `src/lib/import/`, plus a UI hook. The existing
`parse.ts` / `layout.ts` / `pitch.ts` stay untouched and DOM-free.

```
file bytes
  │
  ▼
musicxml/parseDocument.ts   (.mxl? → fflate unzip; XML → fast-xml-parser)
  │   → NormalizedScore  (header + measures of normalized notes)
  ▼
fingering.ts                (per note: honor embedded, else solve placement)
  │   → measures with ViolinNote placements
  ▼
toShorthand.ts              (→ shorthand text)
  │
  ▼
musicxml.ts   (orchestrator) → ImportResult
  │
  ▼
TabWorkbench.tsx            (Import button → apply setters + show warnings)
```

### 3.1 `musicxml/parseDocument.ts`

Turns bytes into a normalized structure, isolating all MusicXML-format ugliness.

- **`.mxl` detection + unzip:** `.mxl` is a ZIP (magic bytes `PK\x03\x04`). Unzip
  with **fflate**, read `META-INF/container.xml` to find the rootfile, load that
  `.xml`. Plain `.musicxml`/`.xml` is decoded as UTF-8 directly.
- **XML → object tree** via **fast-xml-parser** (node- and browser-safe; chosen
  over `DOMParser` so the core is unit-testable without a DOM, per the repo's
  "keep core DOM-free" convention).
- **Format:** support `<score-partwise>`. `<score-timewise>` → hard-ish warning
  ("re-export as partwise"); no output for the notes.
- **Extract** the first `<part>`, first voice, single staff. Emit a warning
  listing any dropped parts/voices/staves.
- **Output — `NormalizedScore`:**

```ts
interface NormalizedScore {
  header: {
    keyFifths: number; keyMode?: "major" | "minor";
    beats: number; beatType: number;         // time signature
    tempo?: number;                          // bpm if present
    instrumentHint?: "violin" | "cello";     // from part-name / instrument-sound
    divisions: number;                       // MusicXML ticks per quarter
  };
  measures: NormMeasure[];
  warnings: string[];
}
interface NormMeasure { notes: NormNote[]; repeatStart?: boolean; repeatEnd?: boolean; repeatCount?: number; }
interface NormNote {
  isRest: boolean;
  chord: boolean;                 // true = sounds with the previous note (double stop)
  pitchMidi?: number;             // absent for rests
  type: "w" | "h" | "q" | "e" | "s";
  dots: number;                   // 0 or 1 supported; >1 warns
  triplet: boolean;               // from <time-modification> 3:2
  tieStart: boolean;
  embed?: { stringNum?: number; finger?: number };  // <technical> string / fingering
}
```

`divisions` is captured so we can sanity-check `<type>` against `<duration>` and
warn on mismatches, but `<type>` is the authoritative rhythm source (it maps
straight onto our `Duration` enum).

### 3.2 `fingering.ts` — the solver

`assignFingering(targetMidi, carried, instrument) → { note: ViolinNote | null; carried; warning? }`

- **Inverted index** (built once per instrument from `instrument.naturalFingerMidi`
  + `openMidi`): for every `(string, position, finger)` compute base MIDI and
  also base±1 (the `L`/`H` levels); add open strings as `finger 0`. Key by
  resulting MIDI → list of candidate placements.
- **Embedded honor:** if the note carries `<technical>` string and/or fingering,
  use it directly (map the MusicXML string number to our 1-based index — see
  §3.5); if only a finger is given, restrict candidates to that finger.
- **Scoring** (lower is better), over candidates for `targetMidi`:
  - `+ shiftCost * |position − carried.position|` (dominant term — stay in position)
  - `+ crossCost` if `string ≠ carried.string`
  - `− openBonus` if `finger === 0`
  - `+ position` (tiebreak toward lower positions)
  - `+ levelPenalty` for `L`/`H` over a natural placement (avoid gratuitous ∓1)
  - Concrete weights live in the module as named constants, tuned in tests.
- Pick min cost; update `carried = { position, string }`.
- **Unsolvable** (no candidate — the target pitch isn't reachable on this
  instrument; notably any fingered note on **cello**, whose chart is the stub):
  return `note: null` + a warning. The caller turns a null placement into a rest
  and aggregates a single summary warning ("N notes couldn't be fingered for
  <instrument> — the cello fingering chart is not yet filled in").

The solver is pure and the most heavily tested module. It is deliberately reusable
by a future MIDI importer (same pitch→placement problem).

### 3.3 `toShorthand.ts`

`toShorthand(measures) → string`. Serializes placed notes to shorthand — the
inverse of `parse.ts`:

- Duration prefix only when it changes (`parse.ts` carries duration forward):
  `q:`, `e:`, dotted `qd:`, triplet `et:` etc.
- Note token: `(P)?<string><L|H>?<finger>`, e.g. `d0`, `aH2`, `(3)e1`. Position
  omitted when 1.
- Double stop: `q:e1:a2` (chord group joined by `:`).
- Rest: `r`. Tie: trailing `~`. Barline `|` between measures; repeats `|:`…`:|`
  (with `:|x3` count when present).

Enables a round-trip property test: `parseTab(toShorthand(x)).measures` matches
the placed structure.

### 3.4 `musicxml.ts` — orchestrator

`importMusicXml(bytes: Uint8Array | string, opts: { fallbackInstrument: InstrumentId }) → ImportResult`.
Wires the three modules, maps `header.keyFifths`+`keyMode` → our key string (finite lookup),
`beats/beatType` → `"N/M"`, resolves the instrument (hint → else the caller's
current instrument, passed via opts), collects all warnings, returns
`ImportResult`. Never throws for musical content; throws/returns an error object
only for hard failures (not XML, not MusicXML, empty, timewise).

### 3.5 String-number mapping

MusicXML `<string>` for bowed instruments numbers strings high→low is *not*
guaranteed; conventionally string 1 is the highest-pitched. Our model is the
same (string 1 = highest). v1 maps `stringNum` directly to our index and, if the
resulting placement's open pitch doesn't bracket `targetMidi`, ignores the
embedded string and falls back to the solver (with a warning). This keeps a
mis-numbered file from producing wrong tab silently.

## 4. Rhythm & header mapping (reference)

| MusicXML | Shorthand / setting |
|---|---|
| `<type>` whole/half/quarter/eighth/16th | `w` `h` `q` `e` `s` |
| `<dot/>` (one) | dotted (`qd`) |
| `<time-modification>` 3:2 | triplet (`qt`) |
| `<chord/>` | extra note in same beat (double stop) |
| `<rest/>` | `r` |
| `<tie type="start"/>` | trailing `~` |
| `<measure>` boundary | `|` |
| `<barline><bar-style>light-light` | `||` (double barline) |
| `<barline><repeat>` | `|:` / `:|` (`:|x3`) |
| `<key><fifths>` + `<mode>` | keySig (`"D"`, `"Bb"`, `"Am"`) |
| `<time><beats>/<beat-type>` | timeSig (`"4/4"`) |
| `<sound tempo>` / `<metronome>` | bpm (default 96) |

## 5. Scope (v1) — YAGNI

**Supported:** first `<part>`, first voice, single staff; pitched notes, rests,
single dots, triplets, chords/double-stops, ties, key/time/tempo, measures,
basic repeats.

**Warned + skipped (best-effort, output still valid):** grace notes, non-triplet
tuplets, double-dots, multiple parts/voices/staves, timewise format, unpitched
notes, ornaments/glissandi (playback-only concerns the tab doesn't model).

**Cello:** un-annotated cello notes are unsolvable while the cello fingering
chart is the stub (→ rest + summary warning). Files that carry embedded
fingerings import fine on cello. This is consistent with the current cello state
and needs no chart work here.

## 6. UI

`TabWorkbench.tsx`: an **Import MusicXML** button + a hidden `<input type="file"
accept=".musicxml,.xml,.mxl">`. On selection: read bytes, call `importMusicXml`
(passing the current `instrumentId` as the fallback), then:

- Hard error → show the message; leave the current tab untouched.
- Success → apply `setText` / `setKeySig` / `setTimeSigStr` / `setBpm` /
  `setInstrumentId`, and render `warnings[]` in a dismissible list under the
  button. If the untouched-sample swap logic would fire, importing counts as
  "touched" (never clobbered by an instrument flip afterward).

Contextual class names throughout (`import-musicxml-btn`, `import-warnings`, …).

## 7. Error handling

Content issues → `warnings[]`, best-effort output (mirrors `parseTab` never
throwing). Hard failures → a returned error the UI surfaces without disturbing
the current tab:

- Not valid XML / not `<score-partwise>` / `<score-timewise>` / empty file.
- `.mxl` with no readable rootfile.

## 8. Dependencies

- **fflate** (~10KB, no transitive deps) — `.mxl` unzip.
- **fast-xml-parser** (small, no transitive deps) — XML → object tree, node- and
  browser-safe.

Both are runtime deps in the client bundle, tree-shakeable. Keep the single-vite
`overrides` pin intact (`npm ls vite` stays at one version after install).

## 9. Testing

- **`fingering.ts`** — known pitches resolve to expected placements; position is
  carried forward (a run stays in position); string-crossing is avoided when a
  same-string option exists; open strings preferred; embedded fingering honored
  and mis-numbered embedded string rejected; cello fingered note → null + warning.
- **`parseDocument.ts`** — inline XML fixtures exercise `<type>`/dots/triplets/
  chords/ties/key/time/tempo; `.mxl` bytes fixture unzips; timewise → warning;
  multi-part → first part + warning.
- **`toShorthand.ts`** — placements → expected shorthand, incl. duration-carry,
  double stops, positions, ties, barlines; round-trip
  `parseTab(toShorthand(x)).measures` matches.
- **`musicxml.ts`** — end-to-end on 2–3 fixtures (a simple violin melody, a
  double-stop snippet, a zipped `.mxl`): assert `text`, header settings, and
  warnings.

`npx astro check` stays at 0 errors; `npm test` green.

## 10. Out of scope (future)

Multi-part/voice selection UI, MIDI import (reuses `fingering.ts`), full
phrase-level fingering optimization, non-triplet tuplets, exporting our tab
back to MusicXML, and filling in the cello fingering chart (tracked separately).
