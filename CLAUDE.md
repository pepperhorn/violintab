# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev -- --host 0.0.0.0` — dev server (http://localhost:4321)
- `npm run build` — static build to `./dist`
- `npm test` — run all Vitest suites once
- `npx vitest run src/lib/tab/pitch.test.ts` — run a single test file
- `npx vitest run -t "double stop"` — run tests matching a name
- `npx astro check` — TypeScript / Astro diagnostics (must stay at 0 errors)

## Architecture

A single-page Astro app that turns a text shorthand into rendered, playable
violin tablature. `src/pages/index.astro` mounts one React island,
`TabWorkbench`, via `client:load`; there is no SSR (static output).

The pipeline is a one-way data flow, all under `src/lib/tab/`:

1. **`parse.ts`** — `parseTab(text, opts)` tokenizes the shorthand into a
   `TabDoc` (measures → beats → notes) plus a list of `ParseError`s. A note is
   `(P)?<string><L|H>?<finger>`; `parseNote` is exported and unit-tested
   directly. Duration/rest/repeat/barline/chord-label handling mirrors the
   `frames` guitar-tab parser. Parsing never throws — errors are collected so
   the UI can show them while keeping the last good render.
2. **`layout.ts`** — `layoutTab(doc, opts)` is pure geometry: it packs measures
   into systems (line wrapping), assigns x-positions, beam groups, triplet
   groups, and flags, and tags each beat with a `posLabel` ("Nth pos.") when the
   hand position changes. Output (`TabLayout`) is plain data — no rendering.
3. **`TabStaff.tsx`** — renders a `TabLayout` to SVG (staff lines, finger
   glyphs with line-knockout boxes, stems/beams/flags, triplet brackets,
   position labels, chord symbols). Pure presentational component.
4. **`playback.ts`** — `buildSchedule` (pure, unit-tested timing math) +
   `createTabPlayer` (loads the `violin` MusyngKite soundfont via `smplr`,
   schedules notes on the AudioContext clock, drives the cursor highlight).

Supporting modules:

- **`types.ts`** — the shared data model (`ViolinNote`, `Beat`, `Measure`,
  `TabDoc`, `Duration`, `FingerLevel`). String index 1 = E (top), 4 = G (bottom).
- **`instruments.ts`** — the single `VIOLIN` config: tuning `E A D G`, open MIDI
  `[76, 69, 62, 55]`, soundfont patch `violin`.
- **`pitch.ts`** — `noteToMidi` resolves a note to MIDI via `NATURAL_FINGER_MIDI`,
  a literal `[string][position] -> [f1,f2,f3,f4]` lookup, with `L`/`H` as ∓1
  semitone and open strings ignoring position/level. See "Pitch model" below.
- **`durations.ts`** — duration fractions + `parseDurationToken` (shared,
  unchanged from `frames`).

`TabWorkbench.tsx` owns all UI state and wires the pipeline with `useMemo`. It
keeps the last cleanly-parsed `TabDoc` in a ref so a typo in the editor never
blanks the preview. Export (`scaleExport.ts`, `tabExport.ts`, `render/pdfFonts.ts`)
serializes the live SVG to SVG/PNG and embeds TTFs for faithful PDF output.

## Pitch model (the one violin-specific subtlety)

A violin finger number is **not** a fixed pitch (no frets). The mapping is a
literal lookup table reconstructed from a standard fingering chart, not a
formula — within each position the half/whole-step pattern differs per string.
`NATURAL_FINGER_MIDI` in `pitch.ts` is the source of truth; each row is strictly
ascending and `pitch.test.ts` guards that invariant plus known anchor notes.
When changing pitch behavior, update the table and the spec table together:
`docs/superpowers/specs/2026-06-04-violin-tab-writer-design.md` §4.

## Conventions

- Path alias `@/*` → `src/*` (configured in both `tsconfig.json` and
  `vitest.config.ts`).
- Keep `parse.ts`, `layout.ts`, and `pitch.ts` free of React/DOM so they stay
  unit-testable; put all rendering in `TabStaff.tsx`.
- `vite` is pinned via `overrides` to a single version (7.3.2) — Astro's
  rolldown-vite and `@tailwindcss/vite` break the build if two vite versions
  resolve. Keep dep bumps aligned so only one `vite` is installed
  (`npm ls vite`).
