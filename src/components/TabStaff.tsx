// src/components/TabStaff.tsx
import type { ReactElement } from "react";
import { LAYOUT, type PlacedBeat, type TabLayout, type TabSystem } from "@/lib/tab/layout";
import type { Duration, ViolinNote } from "@/lib/tab/types";

interface TabStaffProps {
  layout: TabLayout;
  cursorIndex?: number | null;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  noteFontSize?: number;
  chordFontSize?: number;
  chordFontFamily?: string;
  positionFontSize?: number;
  className?: string;
}

const TUNING_FONT_SIZE = 11;

/** The glyph printed on the string line: finger number with an optional L/H
 *  prefix for a low/high fingering, e.g. "0", "1", "L2", "H3". */
function glyphFor(note: ViolinNote): string {
  return `${note.level ?? ""}${note.finger}`;
}

export function TabStaff({
  layout,
  cursorIndex = null,
  fontFamily = "Poppins, sans-serif",
  color = "#0a0a0a",
  backgroundColor = "transparent",
  noteFontSize = 13,
  chordFontSize = 13,
  chordFontFamily,
  positionFontSize = 11,
  className,
}: TabStaffProps) {
  const chordFont = chordFontFamily || fontFamily;
  return (
    <svg
      className={className}
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ fontFamily }}
    >
      <rect x={0} y={0} width={layout.width} height={layout.height} fill={backgroundColor} />

      {/* Page header (title / subtitle / feel / key), top-left */}
      {layout.header.map((line, i) => (
        <text
          key={`hdr-${i}`}
          className="tab-header-line"
          x={4}
          y={line.y}
          fontSize={line.size}
          fontFamily={fontFamily}
          fontWeight={line.weight}
          fontStyle={line.italic ? "italic" : "normal"}
          fill={color}
          textAnchor="start"
          dominantBaseline="central"
        >
          {line.text}
        </text>
      ))}

      {layout.systems.map((sys, i) => (
        <SystemView
          key={i}
          sys={sys}
          layout={layout}
          showTimeSig={i === 0}
          stemBaseY={sys.lineYs[layout.stringCount - 1]}
          color={color}
          cursorIndex={cursorIndex}
          fontFamily={fontFamily}
          noteFontSize={noteFontSize}
          chordFontSize={chordFontSize}
          chordFont={chordFont}
          positionFontSize={positionFontSize}
        />
      ))}
    </svg>
  );
}

function SystemView({
  sys,
  layout,
  showTimeSig,
  stemBaseY,
  color,
  cursorIndex,
  fontFamily,
  noteFontSize,
  chordFontSize,
  chordFont,
  positionFontSize,
}: {
  sys: TabSystem;
  layout: TabLayout;
  showTimeSig: boolean;
  stemBaseY: number;
  color: string;
  cursorIndex: number | null;
  fontFamily: string;
  noteFontSize: number;
  chordFontSize: number;
  chordFont: string;
  positionFontSize: number;
}) {
  const beamY = stemBaseY + LAYOUT.STEM_LEN;
  return (
    <g className="tab-system">
      {/* Staff lines (one per string) */}
      {sys.lineYs.map((y, i) => (
        <line
          key={`line-${i}`}
          x1={sys.lineX0}
          y1={y}
          x2={sys.lineX1}
          y2={y}
          stroke={color}
          strokeWidth={1}
        />
      ))}

      {/* String names (clef substitute), to the right of the time signature */}
      {layout.tuning.map((t, i) => (
        <text
          key={`tuning-${i}`}
          x={40}
          y={sys.lineYs[i]}
          fontSize={TUNING_FONT_SIZE}
          fontFamily={fontFamily}
          fontWeight={600}
          fill={color}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {t}
        </text>
      ))}

      {/* Time signature on the first system */}
      {showTimeSig && (
        <g className="tab-timesig">
          <text
            x={14}
            y={(sys.lineYs[0] + sys.lineYs[layout.stringCount - 1]) / 2 - 12}
            fontSize={28}
            fontWeight={700}
            fill={color}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {layout.timeSig.num}
          </text>
          <text
            x={14}
            y={(sys.lineYs[0] + sys.lineYs[layout.stringCount - 1]) / 2 + 12}
            fontSize={28}
            fontWeight={700}
            fill={color}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {layout.timeSig.den}
          </text>
        </g>
      )}

      {/* Barlines */}
      {sys.barlines.map((bar, i) => (
        <line
          key={`bar-${i}`}
          x1={bar.x}
          y1={sys.lineYs[0]}
          x2={bar.x}
          y2={sys.lineYs[layout.stringCount - 1]}
          stroke={color}
          strokeWidth={bar.final ? 3 : 1.5}
        />
      ))}

      {/* Beats */}
      {sys.beats.map((beat) => (
        <BeatView
          key={beat.globalBeatIndex}
          beat={beat}
          sys={sys}
          layout={layout}
          stemBaseY={stemBaseY}
          color={color}
          fontFamily={fontFamily}
          noteFontSize={noteFontSize}
          highlighted={cursorIndex === beat.globalBeatIndex}
        />
      ))}

      {/* Beams + flags + triplet brackets */}
      {layout.showStems && drawBeams(sys, beamY, color)}
      {layout.showStems && drawTriplets(sys, beamY, color, fontFamily)}

      {/* Position labels ("Nth pos.") beneath the staff */}
      {drawPositions(sys, beamY, color, fontFamily, positionFontSize)}

      {/* Chord symbols in the row above the staff */}
      {layout.chordRowH > 0 && drawChordRow(sys, layout, color, chordFont, chordFontSize)}
    </g>
  );
}

function drawPositions(
  sys: TabSystem,
  beamY: number,
  color: string,
  fontFamily: string,
  fontSize: number,
) {
  const out: ReactElement[] = [];
  const rowY = beamY + 12;
  for (const beat of sys.beats) {
    if (!beat.posLabel) continue;
    out.push(
      <text
        key={`pos-${beat.globalBeatIndex}`}
        className="tab-position-label"
        x={beat.x}
        y={rowY}
        fontSize={fontSize}
        fontFamily={fontFamily}
        fontStyle="italic"
        fill={color}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {beat.posLabel}
      </text>,
    );
  }
  return out;
}

function drawChordRow(
  sys: TabSystem,
  layout: TabLayout,
  color: string,
  font: string,
  fontSize: number,
) {
  const out: ReactElement[] = [];
  const labelY = sys.lineYs[0] - layout.chordRowH / 2;
  for (const beat of sys.beats) {
    if (!beat.chord?.label) continue;
    out.push(
      <text
        key={`chord-${beat.globalBeatIndex}`}
        className="tab-chord-label"
        x={beat.x}
        y={labelY}
        fontSize={fontSize}
        fontFamily={font}
        fontWeight={600}
        fill={color}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {beat.chord.label}
      </text>,
    );
  }
  return out;
}

function drawTriplets(sys: TabSystem, beamY: number, color: string, fontFamily: string) {
  const groups = new Map<number, PlacedBeat[]>();
  for (const b of sys.beats) {
    if (b.tripletGroup === null) continue;
    const arr = groups.get(b.tripletGroup) ?? [];
    arr.push(b);
    groups.set(b.tripletGroup, arr);
  }
  const out: ReactElement[] = [];
  const y = beamY + 9;
  for (const [id, members] of groups) {
    const x0 = members[0].x;
    const x1 = members[members.length - 1].x;
    const mid = (x0 + x1) / 2;
    out.push(
      <path
        key={`trip-${id}`}
        d={`M ${x0} ${y - 3} L ${x0} ${y} L ${mid - 5} ${y} M ${mid + 5} ${y} L ${x1} ${y} L ${x1} ${y - 3}`}
        stroke={color}
        strokeWidth={0.8}
        fill="none"
      />,
    );
    out.push(
      <text
        key={`trip-label-${id}`}
        x={mid}
        y={y}
        fontSize={9}
        fontFamily={fontFamily}
        fontStyle="italic"
        fill={color}
        textAnchor="middle"
        dominantBaseline="central"
      >
        3
      </text>,
    );
  }
  return out;
}

function drawBeams(sys: TabSystem, beamY: number, color: string) {
  const groups = new Map<number, PlacedBeat[]>();
  for (const b of sys.beats) {
    if (b.beamGroup === null || b.isRest) continue;
    const arr = groups.get(b.beamGroup) ?? [];
    arr.push(b);
    groups.set(b.beamGroup, arr);
  }
  const out: ReactElement[] = [];
  for (const [id, members] of groups) {
    if (members.length < 2) continue; // singletons get a flag in BeatView
    const x0 = members[0].x;
    const x1 = members[members.length - 1].x;
    const maxFlags = Math.max(...members.map((m) => m.flags));
    for (let f = 0; f < maxFlags; f++) {
      out.push(
        <line
          key={`beam-${id}-${f}`}
          x1={x0}
          y1={beamY - f * 5}
          x2={x1}
          y2={beamY - f * 5}
          stroke={color}
          strokeWidth={3}
        />,
      );
    }
  }
  return out;
}

function BeatView({
  beat,
  sys,
  layout,
  stemBaseY,
  color,
  fontFamily,
  noteFontSize,
  highlighted,
}: {
  beat: PlacedBeat;
  sys: TabSystem;
  layout: TabLayout;
  stemBaseY: number;
  color: string;
  fontFamily: string;
  noteFontSize: number;
  highlighted: boolean;
}) {
  const beamY = stemBaseY + LAYOUT.STEM_LEN;
  const stemTopY = Math.min(stemBaseY + noteFontSize / 2 + 4, beamY - 6);
  const knockoutH = noteFontSize + 3;
  const isFlaggedSingleton =
    layout.showStems && beat.beamGroup !== null && !beat.isRest && isSingleton(sys, beat);

  return (
    <g className="tab-beat">
      {highlighted && (
        <rect
          x={beat.x - 10}
          y={sys.lineYs[0] - 8}
          width={20}
          height={(layout.stringCount - 1) * LAYOUT.LINE_GAP + 16}
          fill="#3b82f6"
          opacity={0.15}
          rx={3}
        />
      )}

      {beat.isRest ? (
        restGlyph(
          beat.x,
          (sys.lineYs[0] + sys.lineYs[layout.stringCount - 1]) / 2,
          noteFontSize,
          color,
          beat.duration,
          beat.dotted,
        )
      ) : (
        beat.notes.map((n, i) => {
          const y = sys.lineYs[n.string - 1];
          const glyph = glyphFor(n);
          const rw = glyph.length * noteFontSize * 0.62 + 4;
          const dotR = Math.max(1.5, noteFontSize * 0.13);
          const dotX = beat.x + rw / 2 + dotR + 1;
          return (
            <g key={i} className="tab-note">
              {/* knock out the staff line behind the glyph */}
              <rect
                x={beat.x - rw / 2}
                y={y - knockoutH / 2}
                width={rw}
                height={knockoutH}
                fill={layoutBg()}
              />
              <text
                x={beat.x}
                y={y}
                fontSize={noteFontSize}
                fontFamily={fontFamily}
                fontWeight={600}
                fill={color}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {glyph}
              </text>
              {beat.dotted && (
                <>
                  <rect
                    x={dotX - dotR - 1}
                    y={y - knockoutH / 2}
                    width={dotR * 2 + 2}
                    height={knockoutH}
                    fill={layoutBg()}
                  />
                  <circle cx={dotX} cy={y} r={dotR} fill={color} />
                </>
              )}
            </g>
          );
        })
      )}

      {/* Stem */}
      {layout.showStems && !beat.isRest && beat.duration !== "w" && beat.duration !== "wt" && (
        <line x1={beat.x} y1={stemTopY} x2={beat.x} y2={beamY} stroke={color} strokeWidth={1.5} />
      )}

      {/* Flag for an un-beamed eighth/sixteenth */}
      {isFlaggedSingleton &&
        Array.from({ length: beat.flags }).map((_, f) => (
          <line
            key={`flag-${f}`}
            x1={beat.x}
            y1={beamY - f * 5}
            x2={beat.x + 7}
            y2={beamY - f * 5}
            stroke={color}
            strokeWidth={3}
          />
        ))}
    </g>
  );
}

function isSingleton(sys: TabSystem, beat: PlacedBeat): boolean {
  if (beat.beamGroup === null) return false;
  return sys.beats.filter((b) => b.beamGroup === beat.beamGroup && !b.isRest).length === 1;
}

function layoutBg(): string {
  // Glyphs sit on lines; knock the line out with the page background (white).
  return "#ffffff";
}

/** Rests drawn as vector shapes (one per duration) so they render identically
 *  on screen, in PNG, and in PDF. The musical Unicode rest glyphs are avoided
 *  because embedded TTFs lack them and svg2pdf mangles the surrogate pairs.
 *  Triplet rests use the base-duration glyph; dotted rests get an augmentation dot. */
function restGlyph(
  cx: number,
  cy: number,
  size: number,
  color: string,
  duration: Duration,
  dotted: boolean,
): ReactElement {
  const s = size;
  const g = LAYOUT.LINE_GAP;
  const base = duration.endsWith("t") ? duration.slice(0, -1) : duration;
  const lw = Math.max(1.4, s * 0.15);
  const parts: ReactElement[] = [];

  // Knockout so the rest reads cleanly over the staff lines.
  const koW = s * 1.6;
  const koH = g + s * 0.7;
  parts.push(
    <rect key="ko" x={cx - koW / 2} y={cy - koH / 2} width={koW} height={koH} fill={layoutBg()} />,
  );

  if (base === "w" || base === "h") {
    // A block on a staff line: whole hangs below the line, half sits above it.
    const lineRef = cy - g / 2; // the A string line (2nd from top)
    const w = s * 0.95;
    const h = g * 0.5;
    const y = base === "w" ? lineRef : lineRef - h;
    parts.push(<rect key="bar" x={cx - w / 2} y={y} width={w} height={h} fill={color} />);
  } else if (base === "q") {
    // Quarter rest: zig-zag with a bottom curl.
    const ht = s * 1.3;
    const w = ht * 0.4;
    const top = cy - ht / 2;
    const d =
      `M ${cx - w * 0.35} ${top} ` +
      `L ${cx + w * 0.5} ${top + ht * 0.32} ` +
      `L ${cx - w * 0.35} ${top + ht * 0.54} ` +
      `L ${cx + w * 0.55} ${top + ht * 0.9} ` +
      `Q ${cx + w * 0.1} ${top + ht} ${cx - w * 0.2} ${top + ht * 0.92}`;
    parts.push(
      <path key="q" d={d} fill="none" stroke={color} strokeWidth={lw}
        strokeLinecap="round" strokeLinejoin="round" />,
    );
  } else {
    // Eighth (1 flag) / sixteenth (2 flags): a slanted stem with hooked blobs.
    const flags = base === "s" ? 2 : 1;
    const flagGap = s * 0.46;
    const ht = s * 1.2 + (flags - 1) * flagGap;
    const top = cy - ht / 2;
    const bottom = cy + ht / 2;
    const stemTopX = cx + s * 0.26;
    const stemBotX = cx - s * 0.32;
    const stemXAt = (y: number) =>
      stemTopX + ((y - top) / (bottom - top)) * (stemBotX - stemTopX);
    parts.push(
      <line key="stem" x1={stemTopX} y1={top} x2={stemBotX} y2={bottom}
        stroke={color} strokeWidth={lw} strokeLinecap="round" />,
    );
    const r = s * 0.16;
    for (let k = 0; k < flags; k++) {
      const fy = top + r + k * flagGap;
      const sx = stemXAt(fy);
      parts.push(<circle key={`fl${k}`} cx={sx - s * 0.14} cy={fy} r={r} fill={color} />);
      parts.push(
        <line key={`fc${k}`} x1={sx} y1={fy + r * 0.25} x2={sx - s * 0.14} y2={fy}
          stroke={color} strokeWidth={lw * 0.9} strokeLinecap="round" />,
      );
    }
  }

  if (dotted) {
    const dr = Math.max(1.5, s * 0.13);
    parts.push(<circle key="dot" cx={cx + s * 0.6} cy={cy} r={dr} fill={color} />);
  }

  return <g className="tab-rest">{parts}</g>;
}
