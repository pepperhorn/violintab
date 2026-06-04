export interface SvgSource {
  source: string;
  width: number;
  height: number;
}

export function getSvgSource(container: HTMLElement | null): SvgSource | null {
  const svg = container?.querySelector("svg");
  if (!svg) return null;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  const bbox = svg.getBoundingClientRect();
  const vb = svg.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  const width = vb && vb.length === 4 ? vb[2] : bbox.width || 400;
  const height = vb && vb.length === 4 ? vb[3] : bbox.height || 500;
  return {
    source: new XMLSerializer().serializeToString(clone),
    width,
    height,
  };
}

export function triggerDownload(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function safeFilename(parts: Array<string | undefined>, ext: string): string {
  const cleaned = parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .map((p) => p.replace(/[^\w\-]+/g, "_"));
  const base = cleaned.length ? cleaned.join("-") : "frame";
  return `${base}.${ext}`;
}

export function downloadSvgFromContainer(container: HTMLElement | null, filename: string) {
  const data = getSvgSource(container);
  if (!data) return;
  const blob = new Blob([data.source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

/**
 * Render the diagram SVG inside `container` into a single-page PDF, scaled to
 * fit the page (defaults to A4, auto orientation). Uses jspdf + svg2pdf.js's
 * named `svg2pdf(el, pdf, opts)` call, loaded on demand. Dimensions come from
 * the viewBox so composited captions (which grow the viewBox) are included.
 */
export async function downloadPdfFromContainer(
  container: HTMLElement | null,
  filename: string,
  options: {
    format?: string | [number, number];
    orientation?: "portrait" | "landscape";
    margin?: number;
  } = {},
) {
  const svg = container?.querySelector("svg");
  if (!svg) return;
  const vb = svg.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  const w = vb && vb.length === 4 ? vb[2] : svg.getBoundingClientRect().width;
  const h = vb && vb.length === 4 ? vb[3] : svg.getBoundingClientRect().height;
  if (!w || !h) return;

  const { jsPDF } = await import("jspdf");
  const { svg2pdf } = await import("svg2pdf.js");
  const { registerPdfFonts, familiesInSvg } = await import("./render/pdfFonts");

  const orientation = options.orientation ?? (w > h ? "landscape" : "portrait");
  const format = options.format ?? "a4";
  const pdf = new jsPDF({ orientation, unit: "pt", format });

  // Embed the TTFs referenced by the SVG so svg2pdf renders real fonts instead
  // of falling back to Helvetica.
  await registerPdfFonts(pdf, familiesInSvg(svg));
  const margin = options.margin ?? 36;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  // Fit within both page dimensions; never upscale past 1:1.
  const scale = Math.min((pageW - margin * 2) / w, (pageH - margin * 2) / h, 1);
  const drawW = w * scale;
  const drawH = h * scale;
  const x = (pageW - drawW) / 2; // center horizontally
  const y = margin;

  await svg2pdf(svg as SVGElement, pdf, { x, y, width: drawW, height: drawH });

  const url = URL.createObjectURL(pdf.output("blob"));
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

export function downloadPngFromContainer(
  container: HTMLElement | null,
  filename: string,
  options: { backgroundColor?: string; scale?: number } = {},
) {
  const data = getSvgSource(container);
  if (!data) return;
  const scale = options.scale ?? 3;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(data.width * scale);
  canvas.height = Math.round(data.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = new Image();
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.source)}`;
  img.onload = () => {
    if (options.backgroundColor && options.backgroundColor !== "transparent") {
      ctx.fillStyle = options.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      triggerDownload(url, filename);
      URL.revokeObjectURL(url);
    }, "image/png");
  };
  img.onerror = () => {
    console.error("Failed to load SVG for PNG export");
  };
  img.src = svgUrl;
}
