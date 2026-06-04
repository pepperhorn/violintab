// src/components/TabWorkbench.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { TabStaff } from "./TabStaff";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select } from "./ui/select";
import { parseTab } from "@/lib/tab/parse";
import { layoutTab } from "@/lib/tab/layout";
import { createTabPlayer, type TabPlayerHandle } from "@/lib/tab/playback";
import type { TabDoc } from "@/lib/tab/types";
import { FONT_OPTIONS } from "@/lib/fontOptions";
import {
  downloadPngFromContainer,
  downloadSvgFromContainer,
  safeFilename,
  triggerDownload,
} from "@/lib/scaleExport";
import { downloadPdfFromContainer } from "@/lib/tab/tabExport";

const MAJOR_KEYS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
const MINOR_KEYS = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "Bbm", "Fm", "Cm", "Gm", "Dm"];
const TIME_SIGS = ["4/4", "3/4", "2/4", "6/8", "12/8"];
const BARS_PER_LINE = [1, 2, 3, 4, 5, 6, 8];

const SAMPLE = `[D] q:d0 e:d1 d2 q:e0 q:eH1 | h:(3)e1 q:(3)e2 (3)e3
q:a0:e0 e:a1 a3 q:aL2 q:r | h:g0 q:g1 g3`;

export function TabWorkbench() {
  const [text, setText] = useState(SAMPLE);
  const [keySig, setKeySig] = useState("D");
  const [timeSigStr, setTimeSigStr] = useState("4/4");
  const [bpm, setBpm] = useState(96);
  const [barsPerLine, setBarsPerLine] = useState(4);
  const [showStems, setShowStems] = useState(true);
  const [fontFamily, setFontFamily] = useState("Poppins, sans-serif");
  const [noteFontSize, setNoteFontSize] = useState(13);
  const [positionFontSize, setPositionFontSize] = useState(11);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [feel, setFeel] = useState("");
  const [headerGap, setHeaderGap] = useState(5);
  const [titleSize, setTitleSize] = useState(18);
  const [subtitleSize, setSubtitleSize] = useState(14);
  const [feelSize, setFeelSize] = useState(12);
  const [keySize, setKeySize] = useState(12);
  const [showKey, setShowKey] = useState(true);
  const [chordFontFamily, setChordFontFamily] = useState("Poppins, sans-serif");
  const [chordFontSize, setChordFontSize] = useState(13);
  const [showLookFeel, setShowLookFeel] = useState(false);
  const [showTabJson, setShowTabJson] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const timeSig = useMemo(() => {
    const [num, den] = timeSigStr.split("/").map(Number);
    return { num, den };
  }, [timeSigStr]);

  const doc = useMemo(() => parseTab(text, { keySig, timeSig }), [text, keySig, timeSig]);

  // Keep the last DOC that parsed cleanly so the preview never blanks on a typo.
  const lastGoodDoc = useRef<TabDoc | null>(null);
  if (doc.errors.length === 0) lastGoodDoc.current = doc;
  const renderDoc = doc.errors.length === 0 ? doc : lastGoodDoc.current ?? doc;

  const measureRef = useRef<HTMLDivElement | null>(null);
  const [previewWidth, setPreviewWidth] = useState(880);
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setPreviewWidth(Math.max(320, Math.floor(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(
    () =>
      layoutTab(renderDoc, {
        width: previewWidth,
        tuning: renderDoc.tuning,
        stringCount: renderDoc.stringCount,
        timeSig: renderDoc.timeSig,
        showStems,
        barsPerLine,
        title: title.trim() || undefined,
        subtitle: subtitle.trim() || undefined,
        feel: feel.trim() || undefined,
        headerGap,
        titleSize,
        subtitleSize,
        feelSize,
        keySize,
        showKey,
        chordFontSize,
      }),
    [
      renderDoc, showStems, previewWidth, barsPerLine, title, subtitle, feel, headerGap,
      titleSize, subtitleSize, feelSize, keySize, showKey, chordFontSize,
    ],
  );

  const playerRef = useRef<TabPlayerHandle | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const playGenRef = useRef(0);

  const stop = () => {
    playGenRef.current += 1;
    playerRef.current?.stop();
    playerRef.current = null;
    setPlaying(false);
    setCursorIndex(null);
  };

  const play = async () => {
    stop();
    const gen = playGenRef.current;
    setPlaying(true);
    const player = await createTabPlayer(doc, bpm, {
      onCursor: (i) => setCursorIndex(i),
      onEnd: () => stop(),
    });
    if (gen !== playGenRef.current) {
      player.stop();
      return;
    }
    playerRef.current = player;
  };

  useEffect(() => {
    return () => {
      playerRef.current?.stop();
      playerRef.current = null;
    };
  }, []);

  const filename = (ext: string) => safeFilename([title.trim() || "violin-tab"], ext);
  const downloadSvg = () => downloadSvgFromContainer(previewRef.current, filename("svg"));
  const downloadPng = () =>
    downloadPngFromContainer(previewRef.current, filename("png"), { backgroundColor: "#ffffff" });
  const downloadPdf = async () => {
    setExportError(null);
    try {
      await downloadPdfFromContainer(previewRef.current, filename("pdf"));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "PDF export failed");
    }
  };

  const tabJson = useMemo(
    () =>
      JSON.stringify(
        {
          tuning: doc.tuning,
          stringCount: doc.stringCount,
          keySig: doc.keySig,
          timeSig: doc.timeSig,
          bpm,
          barsPerLine,
          style: {
            showStems,
            fontFamily,
            noteFontSize,
            positionFontSize,
            chordFontFamily,
            chordFontSize,
            title,
            subtitle,
            feel,
            showKey,
            headerGap,
            titleSize,
            subtitleSize,
            feelSize,
            keySize,
          },
          measures: doc.measures,
        },
        null,
        2,
      ),
    [
      doc, bpm, barsPerLine, showStems, fontFamily, noteFontSize, positionFontSize,
      chordFontFamily, chordFontSize, title, subtitle, feel, showKey, headerGap,
      titleSize, subtitleSize, feelSize, keySize,
    ],
  );
  const copyTabJson = async () => {
    try {
      await navigator.clipboard.writeText(tabJson);
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  const saveTabJson = () => {
    const blob = new Blob([tabJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename("json"));
    URL.revokeObjectURL(url);
  };

  const clampSize = (v: string, lo: number, hi: number, fallback: number) =>
    Math.min(hi, Math.max(lo, Number(v) || fallback));

  return (
    <div className="tab-workbench flex flex-col gap-6">
      <Card className="tab-setup-card">
        <CardHeader>
          <CardTitle className="text-lg">Score Setup</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="setup-grid grid grid-cols-2 md:grid-cols-4 gap-3">
            <Label>
              <span>Key</span>
              <Select value={keySig} onChange={(e) => setKeySig(e.target.value)}>
                <optgroup label="Major">
                  {MAJOR_KEYS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </optgroup>
                <optgroup label="Minor">
                  {MINOR_KEYS.map((k) => (
                    <option key={k} value={k}>{k.slice(0, -1)} minor</option>
                  ))}
                </optgroup>
              </Select>
            </Label>
            <Label>
              <span>Time</span>
              <Select value={timeSigStr} onChange={(e) => setTimeSigStr(e.target.value)}>
                {TIME_SIGS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Label>
            <Label>
              <span>Tempo (BPM)</span>
              <Input
                type="number"
                min={30}
                max={300}
                value={bpm}
                onChange={(e) => setBpm(Math.max(30, Number(e.target.value) || 96))}
              />
            </Label>
            <Label>
              <span>Bars / line</span>
              <Select value={String(barsPerLine)} onChange={(e) => setBarsPerLine(Number(e.target.value))}>
                {BARS_PER_LINE.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </Label>
          </div>
          <div className="toggles flex flex-wrap gap-2 items-center pt-2 border-t">
            <Button
              variant={showStems ? "default" : "outline"}
              size="sm"
              onClick={() => setShowStems((s) => !s)}
            >
              Beams/stems: {showStems ? "on" : "off"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="look-feel-card">
        <button
          type="button"
          className="look-feel-toggle w-full"
          onClick={() => setShowLookFeel((v) => !v)}
          aria-expanded={showLookFeel}
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-lg">Look &amp; Feel</CardTitle>
            <span className="text-muted-foreground text-sm">{showLookFeel ? "▲" : "▼"}</span>
          </CardHeader>
        </button>
        {showLookFeel && (
          <CardContent className="flex flex-col gap-4">
            <div className="lf-grid grid grid-cols-2 md:grid-cols-3 gap-3">
              <Label className="col-span-2 md:col-span-1">
                <span>Font</span>
                <Select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </Select>
              </Label>
              <Label>
                <span>Note size</span>
                <Input
                  type="number"
                  min={8}
                  max={28}
                  value={noteFontSize}
                  onChange={(e) => setNoteFontSize(clampSize(e.target.value, 8, 28, 13))}
                />
              </Label>
              <Label>
                <span>Position label size</span>
                <Input
                  type="number"
                  min={7}
                  max={24}
                  value={positionFontSize}
                  onChange={(e) => setPositionFontSize(clampSize(e.target.value, 7, 24, 11))}
                />
              </Label>
              <Label className="col-span-2 md:col-span-1">
                <span>Chord font</span>
                <Select value={chordFontFamily} onChange={(e) => setChordFontFamily(e.target.value)}>
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </Select>
              </Label>
              <Label>
                <span>Chord size</span>
                <Input
                  type="number"
                  min={8}
                  max={32}
                  value={chordFontSize}
                  onChange={(e) => setChordFontSize(clampSize(e.target.value, 8, 32, 13))}
                />
              </Label>
            </div>
            <div className="lf-text-grid grid grid-cols-1 md:grid-cols-3 gap-3">
              <Label>
                <span>Title</span>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="optional" />
              </Label>
              <Label>
                <span>Subtitle</span>
                <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="optional" />
              </Label>
              <Label>
                <span>Feel</span>
                <Input value={feel} onChange={(e) => setFeel(e.target.value)} placeholder="e.g. Andante" />
              </Label>
            </div>
            <div className="lf-size-grid grid grid-cols-2 md:grid-cols-5 gap-3">
              <Label>
                <span>Title size</span>
                <Input type="number" min={8} max={48} value={titleSize}
                  onChange={(e) => setTitleSize(clampSize(e.target.value, 8, 48, 18))} />
              </Label>
              <Label>
                <span>Subtitle size</span>
                <Input type="number" min={8} max={36} value={subtitleSize}
                  onChange={(e) => setSubtitleSize(clampSize(e.target.value, 8, 36, 14))} />
              </Label>
              <Label>
                <span>Feel size</span>
                <Input type="number" min={8} max={32} value={feelSize}
                  onChange={(e) => setFeelSize(clampSize(e.target.value, 8, 32, 12))} />
              </Label>
              <Label>
                <span>Key size</span>
                <Input type="number" min={8} max={32} value={keySize}
                  onChange={(e) => setKeySize(clampSize(e.target.value, 8, 32, 12))} />
              </Label>
              <Label>
                <span>Line spacing (px)</span>
                <Input type="number" min={0} max={40} value={headerGap}
                  onChange={(e) => setHeaderGap(clampSize(e.target.value, 0, 40, 5))} />
              </Label>
            </div>
            <div className="lf-key-toggle flex flex-wrap gap-3 items-center pt-2 border-t">
              <Button
                variant={showKey ? "default" : "outline"}
                size="sm"
                onClick={() => setShowKey((v) => !v)}
              >
                Show key: {showKey ? "on" : "off"}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="preview-card">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">Preview</CardTitle>
          <div className="preview-actions flex gap-2">
            {playing ? (
              <Button size="sm" variant="outline" onClick={stop} className="stop-btn">
                Stop
              </Button>
            ) : (
              <Button size="sm" onClick={play} className="play-btn">
                ▶ Play
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={downloadSvg} className="download-svg-btn">
              SVG
            </Button>
            <Button size="sm" variant="outline" onClick={downloadPng} className="download-png-btn">
              PNG
            </Button>
            <Button size="sm" variant="outline" onClick={downloadPdf} className="download-pdf-btn">
              PDF
            </Button>
          </div>
          {exportError && (
            <div className="export-error w-full text-xs text-red-600">{exportError}</div>
          )}
        </CardHeader>
        <CardContent>
          <div ref={measureRef} className="preview-measure w-full">
            <div ref={previewRef} className="preview-svg-wrap overflow-x-auto bg-white rounded">
              <TabStaff
                layout={layout}
                cursorIndex={cursorIndex}
                fontFamily={fontFamily}
                noteFontSize={noteFontSize}
                chordFontSize={chordFontSize}
                chordFontFamily={chordFontFamily}
                positionFontSize={positionFontSize}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="tab-editor-card">
        <CardHeader>
          <CardTitle className="text-lg">Tab</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <textarea
            className="tab-editor-textarea w-full min-h-[220px] rounded-md border p-3 font-mono text-sm"
            value={text}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
          />
          {doc.errors.length > 0 ? (
            <div className="tab-errors text-xs text-red-600">
              {doc.errors.map((err, i) => (
                <div key={i}>line {err.line}: {err.message}</div>
              ))}
            </div>
          ) : (
            <div className="tab-help text-xs text-muted-foreground">
              note <code>e1</code> = string + finger (<code>e a d g</code>, finger <code>0–4</code>) ·{" "}
              <code>eL1</code>/<code>eH1</code> low/high finger · <code>(3)e1</code> position ·{" "}
              <code>q:e1</code> duration · append <code>d</code> dotted, <code>t</code> triplet ·{" "}
              <code>q:e1:a2</code> double stop · <code>r</code> rest · <code>x</code> repeat ·{" "}
              <code>|</code> barline · <code>|:</code> … <code>:|</code> repeat (<code>:|x3</code> count) ·{" "}
              <code>[Am]</code> chord symbol
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="tab-json-card">
        <div className="tab-json-head flex items-center justify-between gap-2">
          <button
            type="button"
            className="tab-json-toggle flex-1 text-left"
            onClick={() => setShowTabJson((v) => !v)}
            aria-expanded={showTabJson}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm">Tab JSON</CardTitle>
              <span className="text-muted-foreground text-sm">{showTabJson ? "▲" : "▼"}</span>
            </CardHeader>
          </button>
          <div className="tab-json-actions flex gap-2 pr-6">
            <Button size="sm" variant="outline" className="copy-json-btn" onClick={copyTabJson}>
              {jsonCopied ? "Copied!" : "⧉ Copy"}
            </Button>
            <Button size="sm" variant="outline" className="save-json-btn" onClick={saveTabJson}>
              Save .json
            </Button>
          </div>
        </div>
        {showTabJson && (
          <CardContent>
            <pre className="tab-json text-xs overflow-x-auto bg-muted/40 rounded p-3">{tabJson}</pre>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
