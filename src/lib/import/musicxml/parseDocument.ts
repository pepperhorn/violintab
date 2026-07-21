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
