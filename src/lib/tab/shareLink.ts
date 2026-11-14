// Share links: pack the full editor state (raw shorthand + every setting) into
// a compressed, URL-safe string carried in the location hash. Opening such a
// link rebuilds the exact score in an editable state. Pure + DOM-light so the
// encode/decode core stays unit-testable (mirrors parse.ts / layout.ts); the
// URL helpers take optional injected values so they need no real `window`.
import LZString from "lz-string";
import type { InstrumentId } from "./types";

/** Bump when the payload shape changes incompatibly; decode rejects mismatches. */
export const SHARE_VERSION = 1;

/** Presentation settings mirrored from TabWorkbench's style state. */
export interface ShareStyle {
  showStems: boolean;
  showNoteNames: boolean;
  fontFamily: string;
  noteFontSize: number;
  positionFontSize: number;
  noteNameFontSize: number;
  chordFontFamily: string;
  chordFontSize: number;
  title: string;
  subtitle: string;
  feel: string;
  showKey: boolean;
  headerGap: number;
  titleSize: number;
  subtitleSize: number;
  feelSize: number;
  keySize: number;
}

/** Everything needed to reconstruct the workbench from a link. */
export interface SharePayload {
  v: number;
  text: string;
  instrumentId: InstrumentId;
  keySig: string;
  timeSig: string; // e.g. "4/4"
  bpm: number;
  barsPerLine: number;
  style: ShareStyle;
}

/** Hash key the payload rides under: `#tab=<encoded>`. */
const HASH_KEY = "tab";

/** JSON -> LZ-compressed, URL-safe string. */
export function encodeShare(payload: SharePayload): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

/** Inverse of encodeShare. Never throws — returns null on any bad input. */
export function decodeShare(encoded: string): SharePayload | null {
  if (!encoded) return null;
  let json: string | null;
  try {
    json = LZString.decompressFromEncodedURIComponent(encoded);
  } catch {
    return null;
  }
  if (!json) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  return isSharePayload(obj) ? obj : null;
}

function isSharePayload(o: unknown): o is SharePayload {
  if (!o || typeof o !== "object") return false;
  const p = o as Record<string, unknown>;
  return (
    p.v === SHARE_VERSION &&
    typeof p.text === "string" &&
    typeof p.instrumentId === "string" &&
    typeof p.keySig === "string" &&
    typeof p.timeSig === "string" &&
    typeof p.bpm === "number" &&
    typeof p.barsPerLine === "number" &&
    typeof p.style === "object" &&
    p.style !== null
  );
}

/** Absolute URL that reopens the given score. Falls back to `window.location`. */
export function buildShareUrl(
  payload: SharePayload,
  base?: { origin: string; pathname: string },
): string {
  const origin = base?.origin ?? window.location.origin;
  const pathname = base?.pathname ?? window.location.pathname;
  return `${origin}${pathname}#${HASH_KEY}=${encodeShare(payload)}`;
}

/**
 * Pull a payload out of a location hash. Parses manually rather than via
 * URLSearchParams: LZ's URL-safe alphabet uses `+`, which URLSearchParams would
 * decode to a space and corrupt the payload.
 */
export function readShareFromUrl(hash?: string): SharePayload | null {
  const raw = hash ?? (typeof window !== "undefined" ? window.location.hash : "");
  if (!raw) return null;
  const body = raw.startsWith("#") ? raw.slice(1) : raw;
  const prefix = `${HASH_KEY}=`;
  for (const part of body.split("&")) {
    if (part.startsWith(prefix)) return decodeShare(part.slice(prefix.length));
  }
  return null;
}
