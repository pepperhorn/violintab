import LZString from "lz-string";
import { describe, expect, it } from "vitest";
import {
  buildShareUrl,
  decodeShare,
  encodeShare,
  readShareFromUrl,
  SHARE_VERSION,
  type SharePayload,
} from "./shareLink";

const sample = (): SharePayload => ({
  v: SHARE_VERSION,
  text: "[D] q:d0 e:d1 d2 | h:(3)e1 q:(3)e2 (3)e3\nq:a0:e0 e:a1 a3",
  instrumentId: "violin",
  keySig: "D",
  timeSig: "4/4",
  bpm: 96,
  barsPerLine: 4,
  style: {
    showStems: true,
    showNoteNames: false,
    fontFamily: "Poppins, sans-serif",
    noteFontSize: 13,
    positionFontSize: 11,
    noteNameFontSize: 10,
    chordFontFamily: "Poppins, sans-serif",
    chordFontSize: 13,
    title: "My Étude — no. 1",
    subtitle: "for two students",
    feel: "Andante ♩=96",
    showKey: true,
    headerGap: 5,
    titleSize: 18,
    subtitleSize: 14,
    feelSize: 12,
    keySize: 12,
  },
});

describe("encodeShare / decodeShare", () => {
  it("round-trips a full payload", () => {
    const payload = sample();
    expect(decodeShare(encodeShare(payload))).toEqual(payload);
  });

  it("produces a URL-safe string (no #, &, or spaces)", () => {
    const encoded = encodeShare(sample());
    expect(encoded).not.toMatch(/[#&\s]/);
  });

  it("preserves newlines, unicode, and multi-byte glyphs in the tab text", () => {
    const payload = sample();
    payload.text = "line1\nline2\t♯♭𝄞 café";
    expect(decodeShare(encodeShare(payload))?.text).toBe(payload.text);
  });

  it("returns null for empty, garbage, and non-JSON input", () => {
    expect(decodeShare("")).toBeNull();
    expect(decodeShare("!!!not-lz!!!")).toBeNull();
    expect(decodeShare("plainstring")).toBeNull();
  });

  it("rejects a payload with a mismatched version", () => {
    const encoded = LZencode({ ...sample(), v: 999 });
    expect(decodeShare(encoded)).toBeNull();
  });

  it("rejects a structurally wrong object", () => {
    expect(decodeShare(LZencode({ hello: "world" }))).toBeNull();
    expect(decodeShare(LZencode({ ...sample(), style: null }))).toBeNull();
    expect(decodeShare(LZencode({ ...sample(), bpm: "fast" }))).toBeNull();
  });
});

describe("buildShareUrl / readShareFromUrl", () => {
  const base = { origin: "https://tab.example", pathname: "/" };

  it("builds a hash URL that reads back to the original payload", () => {
    const payload = sample();
    const url = buildShareUrl(payload, base);
    expect(url.startsWith("https://tab.example/#tab=")).toBe(true);
    const hash = url.slice(url.indexOf("#"));
    expect(readShareFromUrl(hash)).toEqual(payload);
  });

  it("tolerates a leading '#' or its absence", () => {
    const encoded = encodeShare(sample());
    expect(readShareFromUrl(`#tab=${encoded}`)).toEqual(sample());
    expect(readShareFromUrl(`tab=${encoded}`)).toEqual(sample());
  });

  it("finds tab among other hash params", () => {
    const encoded = encodeShare(sample());
    expect(readShareFromUrl(`#foo=1&tab=${encoded}&bar=2`)).toEqual(sample());
  });

  it("returns null when no tab param is present", () => {
    expect(readShareFromUrl("")).toBeNull();
    expect(readShareFromUrl("#")).toBeNull();
    expect(readShareFromUrl("#other=value")).toBeNull();
  });
});

// Helper: encode an arbitrary (possibly invalid) object the same way encodeShare
// does, so tests can craft malformed payloads without going through the typed API.
function LZencode(obj: unknown): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(obj));
}
