# Violin Tab Writer

Write violin tablature from a compact text shorthand, preview it as clean SVG
notation, play it back, and export to SVG / PNG / PDF.

It's a focused sibling of the guitar-tab tool in the `frames` project, adapted
for the violin's fretless, finger-and-position notation (strings **E A D G**).

## Quick start

```sh
npm install
npm run dev -- --host 0.0.0.0   # http://localhost:4321
npm test                        # vitest
npm run build                   # static build to ./dist
```

## Shorthand

A **note** is `(P)?<string><L|H>?<finger>`:

| Piece    | Values      | Meaning                                            |
|----------|-------------|----------------------------------------------------|
| string   | `e a d g`   | E is the top staff line, G the bottom              |
| finger   | `0`–`4`     | `0` = open string; the number printed on the line  |
| `L`/`H`  | optional    | low / high fingering (a semitone below / above)    |
| `(P)`    | optional    | hand position `(2)`–`(5)`; default 1               |

Beats reuse the `frames` duration grammar:

| Syntax        | Meaning                                            |
|---------------|----------------------------------------------------|
| `q: e: s: h: w:` | duration prefix (quarter / eighth / …)          |
| `+d` / `+t`   | dotted / triplet (`qd:`, `et:`)                    |
| `q:e1:a2`     | double stop (colon-stacked notes in one beat)      |
| `r`           | rest                                               |
| `x`           | repeat the previous beat                           |
| `|`           | barline                                            |
| `|:` … `:|`   | repeat section (`:|x3` adds a play-count)          |
| `[Am]`        | chord-symbol text above the beat                   |

### Example

```
[D] q:d0 e:d1 d2 q:e0 q:eH1 | h:(3)e1 q:(3)e2 (3)e3
q:a0:e0 e:a1 a3 q:aL2 q:r | h:g0 q:g1 g3
```

A `"3rd pos."` / `"1st pos."` label is drawn beneath the first note whenever the
hand position changes.

## Pitch model

Open strings are E5 A4 D4 G3. A fingered pitch comes from a literal lookup of
the natural finger pitches per string and position, with `L`/`H` shifting a
semitone. The full table and rationale are in
[`docs/superpowers/specs/2026-06-04-violin-tab-writer-design.md`](docs/superpowers/specs/2026-06-04-violin-tab-writer-design.md)
(§4) and implemented in `src/lib/tab/pitch.ts`.

## Stack

Astro (static) + React islands, Tailwind 4, `smplr` for audio playback, and
`jspdf` + `svg2pdf.js` for PDF export. Built by the Creative Ranges Foundation.
