# Violin Tab Writer — Design Spec

**Date:** 2026-06-04
**Status:** Approved (pending spec review)

## 1. Overview

A standalone web app for writing **violin tablature** from a compact text
shorthand, rendering it as clean SVG notation, playing it back as audio, and
exporting to SVG/PNG/PDF. It is a focused fork of the existing `frames`
project's guitar-tab pipeline (`~/frames/src/lib/tab/`), adapted for the violin's
fretless, finger-and-position notation.

The deliverable is a single-purpose "Tab" tool — no chord-diagram or scale
workbenches, and no chord *frames* (only chord-symbol text).

## 2. Scope & Project Setup

- **Location:** `/home/shaun/violintab`
- **Stack (mirrors `frames` exactly):** Astro 6, React 19 islands, Tailwind 4,
  Poppins typography, `smplr` (MusyngKite soundfont) for audio,
  `jspdf` + `svg2pdf.js` + `sharp` for export, Vitest for tests.
- **Single mode:** the page renders one Tab workbench directly (no
  chord/scale mode switcher).

### Out of scope
- Chord diagrams / fingering frames (chord **text** labels only).
- Instrument switching (violin only).
- Capo (not meaningful for violin).

## 3. Shorthand Grammar

A **note token** has the form:

```
(P)?  <string>  <L|H>?  <finger>
```

| Piece    | Values        | Meaning                                                        |
|----------|---------------|---------------------------------------------------------------|
| string   | `e a d g`     | which string. E = top staff line, G = bottom.                 |
| finger   | `0`–`4`       | finger number; `0` = open string. This is the printed glyph.  |
| `L`/`H`  | optional      | low / high fingering. Printed as `L1`, `H1`, etc.             |
| `(P)`    | optional      | position (`(2)`, `(3)`, …); default 1. Drives the position label. |

The remaining syntax is **identical to `frames`** and its parser machinery is
reused verbatim:

| Syntax                         | Meaning                                              |
|--------------------------------|------------------------------------------------------|
| `q: e: s: h: w:`               | duration prefix on a beat (quarter/eighth/…)         |
| `+d` / `+t`                    | dotted / triplet (`qd:`, `et:`)                      |
| `q:e1:a2`                      | double stop — colon-stacked notes in one beat        |
| `r`                            | rest                                                 |
| `x`                            | repeat the previous beat                             |
| `|`                            | explicit barline                                     |
| `[Am]`                         | chord-symbol text above the beat (no diagram)        |

A full beat token is therefore `«duration»:«note»[:«note»…]`, e.g.
`qd:(3)eH1:a2`.

### Position semantics
`(P)` attaches to the note it prefixes; both notes of a double stop may carry
their own `(P)` (normally the same). A **"Nth pos."** label (`"2nd pos."`,
`"3rd pos."`, …) is drawn beneath the **first note that enters a new position**
— i.e. whenever a note's position differs from the previous note's position.
Position 1 is the default and is not labelled.

### Example
```
[D] q:d0 e:d1 d2 q:e0 | h:eH1 q:(3)e1 (3)e2
```
D-major chord label; open D; 1st then 2nd finger on the D string; open E. Bar.
High-1 on the E string (held a half note); then a shift to 3rd position for 1st
and 2nd finger on E — a `"3rd pos."` label appears under the first `(3)` note.

## 4. Pitch Model (playback)

Open-string MIDI pitches: **E5 = 76, A4 = 69, D4 = 62, G3 = 55** (string 1→4,
high→low).

Violin finger placement is not a simple formula — within each position the
half/whole-step pattern varies per string. So the pitch model is a **literal
lookup table** of the natural (un-modified) finger pitches, reconstructed from
the user-supplied chart, with `L`/`H` applied as a semitone adjustment:

```
finger 0 (open)        -> openMidi[string]                         (level ignored)
finger 1..4, no level  -> NATURAL[string][position][finger]
finger 1..4, level 'L' -> NATURAL[string][position][finger] - 1
finger 1..4, level 'H' -> NATURAL[string][position][finger] + 1
```

`H1` and `L2` denote the same column in the source chart; both resolve through
the formula above (e.g. on the A string `aH1` = B♭… and `aL2` = C − 1 = B♭ when
the fingers are a whole step apart). Positions 1–5 are supported; position 1 is
the default.

**`NATURAL[string][position]` = `[finger1, finger2, finger3, finger4]` (MIDI).**
This table is the authoritative reconstruction; it matches every explicit
finger-column note in the source chart and is strictly ascending per row.

```ts
const OPEN_MIDI = { G: 55, D: 62, A: 69, E: 76 }; // G3 D4 A4 E5

const NATURAL = {
  G: { 1: [57, 59, 61, 63], 2: [59, 60, 62, 64], 3: [60, 62, 64, 65],
       4: [62, 64, 65, 67], 5: [64, 65, 67, 69] },
  D: { 1: [64, 66, 68, 70], 2: [65, 67, 69, 71], 3: [67, 69, 71, 72],
       4: [69, 71, 72, 74], 5: [71, 72, 74, 76] },
  A: { 1: [71, 73, 75, 77], 2: [72, 74, 76, 77], 3: [74, 76, 77, 79],
       4: [76, 77, 79, 81], 5: [77, 79, 81, 83] },
  E: { 1: [78, 80, 82, 84], 2: [79, 81, 83, 84], 3: [81, 83, 84, 86],
       4: [83, 84, 86, 88], 5: [84, 86, 88, 89] },
};
```

**Readable form (note names):**

| String (open) | Pos | finger 1 | finger 2 | finger 3 | finger 4 |
|---------------|-----|----------|----------|----------|----------|
| G (G3) | 1 | A3  | B3  | C♯4 | D♯4 |
| G (G3) | 2 | B3  | C4  | D4  | E4  |
| G (G3) | 3 | C4  | D4  | E4  | F4  |
| G (G3) | 4 | D4  | E4  | F4  | G4  |
| G (G3) | 5 | E4  | F4  | G4  | A4  |
| D (D4) | 1 | E4  | F♯4 | G♯4 | A♯4 |
| D (D4) | 2 | F4  | G4  | A4  | B4  |
| D (D4) | 3 | G4  | A4  | B4  | C5  |
| D (D4) | 4 | A4  | B4  | C5  | D5  |
| D (D4) | 5 | B4  | C5  | D5  | E5  |
| A (A4) | 1 | B4  | C♯5 | D♯5 | F5  |
| A (A4) | 2 | C5  | D5  | E5  | F5  |
| A (A4) | 3 | D5  | E5  | F5  | G5  |
| A (A4) | 4 | E5  | F5  | G5  | A5  |
| A (A4) | 5 | F5  | G5  | A5  | B5  |
| E (E5) | 1 | F♯5 | G♯5 | A♯5 | C6  |
| E (E5) | 2 | G5  | A5  | B5  | C6  |
| E (E5) | 3 | A5  | B5  | C6  | D6  |
| E (E5) | 4 | B5  | C6  | D6  | E6  |
| E (E5) | 5 | C6  | D6  | E6  | F6  |

**Worked checks (A string, open = A4 = 69):**

| Token   | NATURAL | level | MIDI | Note |
|---------|---------|-------|------|------|
| `a0`    | (open)  | —     | 69   | A4   |
| `a1`    | 71      | —     | 71   | B4   |
| `aL1`   | 71      | −1    | 70   | B♭4  |
| `a2`    | 73      | —     | 73   | C♯5  |
| `aL2`   | 73      | −1    | 72   | C5   |
| `a4`    | 77      | —     | 77   | F5   |
| `(3)a1` | 74      | —     | 74   | D5   |
| `(3)a4` | 79      | —     | 79   | G5   |

## 5. Data Model

Changes to `frames`' `src/lib/tab/types.ts`:

```ts
type FingerLevel = 'L' | 'H';

interface TabNote {
  string: number;        // 1 = highest-pitch string (E)
  finger: number;        // 0–4 (0 = open)
  level?: FingerLevel;   // low / high fingering
  position?: number;     // hand position; default 1
}
```

- `fret` is removed (it has no meaning on a fretless instrument).
- The instrument is fixed to a single `violin` config:
  `tuning: ["E","A","D","G"]`, `openMidi: [76,69,62,55]`, `patch: "violin"`.
- `Beat`, `Measure`, `ChordAnnotation` (label only), `TimeSig`, `Duration`,
  `ParseError`, `TabDoc` are carried over. `ChordFrame` is dropped.

## 6. Components & Rendering

Reused largely verbatim from `frames`; deltas only:

- **`parse.ts`** — replace `parseNote`/`parseFretCode`/`parseChordToken`'s frame
  handling with the §3 violin note grammar (string letter, `L|H`, finger, `(P)`
  prefix). Keep the duration/rest/repeat/barline/chord-label tokenizer and the
  measure-packing loop unchanged. Chord tokens parse **label only**.
- **`pitch.ts`** — `noteToMidi` implements the §4 formula. `midiToFreq`
  unchanged.
- **`layout.ts`** — drop chord-*frame* height reservation; keep the chord-symbol
  band. Add reserved height for a **position-label row** beneath the staff
  (alongside the existing optional fingering row).
- **`TabStaff.tsx`** — render the finger glyph (`0`, `L1`, `H1`, …) on the
  string line with the same line-knockout box; remove `drawChordFrame`; add a
  helper to draw `"Nth pos."` labels under the first note of each new position.
  Stems, beams, flags, triplets, rests, barlines, chord-label row unchanged.
- **`playback.ts`** — identical scheduler; pitches come from the new
  `noteToMidi`. Patch is `violin`.
- **`durations.ts`, `tabExport.ts`, `scaleExport.ts` (export helpers)** — reused
  as-is.

## 7. UI (`TabWorkbench` + page)

A single workbench card stack, like `frames`' Tab tab:

- **Setup:** Key, Time signature, Tempo (BPM), Bars-per-line.
- **Look & Feel (collapsible):** font, glyph size, finger/position label size,
  title/subtitle/feel text + sizes, show-key toggle, chord-symbol font/size.
- **Preview:** Play / Stop, and SVG / PNG / PDF download.
- **Editor:** textarea with live parse errors and a syntax-help line; Tab JSON
  export (copy / save).

Removed vs frames: instrument switcher, bass-string selector, fingering-frame
controls, capo control, chord-frame size controls.

The Astro page (`src/pages/index.astro`) renders `<TabWorkbench client:load />`
directly with violin-appropriate title/eyebrow copy.

## 8. Testing (Vitest)

- **`parse.test.ts`** — note grammar (`e0`, `a4`, `eL1`, `dH3`), `(P)` prefix,
  double stops (`q:e1:a2`), duration prefixes, rests/repeat/barline, chord-label
  tokens, and error cases (bad string letter, finger out of 0–4, malformed
  position).
- **`pitch.test.ts`** — asserts the §4 formula against the worked-checks table
  (open strings, `aL1`=B♭4, `(3)a1`=D5, finger-4 = next open string, etc.).
- **`durations.test.ts`** — reused from frames.
- **`layout.test.ts`** — measure packing / wrapping, reused and trimmed for the
  4-string staff and position-label row.

## 9. Open Questions

None outstanding. The pitch model (§4) is the primary design decision and has
been confirmed.
