import type { jsPDF } from "jspdf";

/**
 * Embeds the app's TTF fonts into a jsPDF document so svg2pdf renders text in
 * the chosen face instead of falling back to Helvetica/Times.
 *
 * svg2pdf resolves a text element's `font-family` by taking the first family
 * token and looking it up in `pdf.getFontList()[family]`, keyed by a "fontType"
 * derived from weight+style: 400→"normal", 700→"bold", and any other weight N →
 * `"${N}normal"` (or `"${N}italic"`). We register each family across the weights
 * our diagrams actually use so every lookup hits a real TTF.
 */

interface FontFace {
  url: string;
  weight: number;
}

// family name (matched against the SVG's first font-family token) -> faces.
// Single-file families reuse one TTF across weights; that's enough for svg2pdf
// matching even if the rendered weight is uniform.
const EMBED_FONTS: Record<string, FontFace[]> = {
  Poppins: [
    { url: "/fonts/Poppins-Regular.ttf", weight: 400 },
    { url: "/fonts/Poppins-Medium.ttf", weight: 500 },
    { url: "/fonts/Poppins-SemiBold.ttf", weight: 600 },
    { url: "/fonts/Poppins-Bold.ttf", weight: 700 },
    { url: "/fonts/Poppins-ExtraBold.ttf", weight: 800 },
  ],
  "Patrick Hand": [{ url: "/fonts/PatrickHand-Regular.ttf", weight: 400 }],
  Caveat: [{ url: "/fonts/Caveat-VF.ttf", weight: 400 }],
  "Shadows Into Light": [{ url: "/fonts/ShadowsIntoLight-Regular.ttf", weight: 400 }],
  Inter: [{ url: "/fonts/Inter-VF.ttf", weight: 400 }],
  // SMuFL music font for rest glyphs; one weight, reused across all lookups.
  Petaluma: [{ url: "/fonts/Petaluma.ttf", weight: 400 }],
};

// Weights our SVG text uses (svguitar defaults + our role/caption styles).
const NEEDED_WEIGHTS = [400, 500, 600, 700, 800];

// Fetched TTFs are cached as base64 across exports — fetch each file once.
const fileCache = new Map<string, Promise<string>>();

async function fetchAsBase64(url: string): Promise<string> {
  let cached = fileCache.get(url);
  if (!cached) {
    cached = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load font ${url}: ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        bin += String.fromCharCode(...buf.subarray(i, i + chunk));
      }
      return btoa(bin);
    })().catch((e) => {
      fileCache.delete(url);
      throw e;
    });
    fileCache.set(url, cached);
  }
  return cached;
}

/** First font-family token, unquoted, e.g. "'Patrick Hand', cursive" → "Patrick Hand". */
export function primaryFamily(fontFamily: string): string {
  return (fontFamily.split(",")[0] ?? "").trim().replace(/^['"]|['"]$/g, "");
}

/** Distinct embeddable families referenced by the SVG's text elements. */
export function familiesInSvg(svg: SVGElement): string[] {
  const found = new Set<string>();
  svg.querySelectorAll("text").forEach((t) => {
    const fam = t.getAttribute("font-family");
    if (fam) {
      const name = primaryFamily(fam);
      if (EMBED_FONTS[name]) found.add(name);
    }
  });
  return [...found];
}

function faceForWeight(faces: FontFace[], weight: number): FontFace {
  // nearest available face by weight
  return faces.reduce((best, f) =>
    Math.abs(f.weight - weight) < Math.abs(best.weight - weight) ? f : best,
  );
}

/** Register the given families (TTFs) on the pdf for every needed weight. */
export async function registerPdfFonts(pdf: jsPDF, families: string[]): Promise<void> {
  const added = new Set<string>(); // VFS filenames already written
  for (const family of families) {
    const faces = EMBED_FONTS[family];
    if (!faces) continue;

    const ensureFile = async (url: string): Promise<string> => {
      const file = url.split("/").pop() as string;
      if (!added.has(file)) {
        pdf.addFileToVFS(file, await fetchAsBase64(url));
        added.add(file);
      }
      return file;
    };

    // weight 400 → "normal", 700 → "bold", others → "${weight}normal"
    for (const weight of NEEDED_WEIGHTS) {
      const face = faceForWeight(faces, weight);
      const file = await ensureFile(face.url);
      if (weight === 400) pdf.addFont(file, family, "normal");
      else if (weight === 700) pdf.addFont(file, family, "bold");
      else pdf.addFont(file, family, "normal", weight);
    }
  }
}
