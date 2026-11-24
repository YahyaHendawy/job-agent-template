/** Renders the tailored CV (markdown subset) as a clean, ATS-friendly single-column PDF. */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

// Standard PDF fonts only cover WinAnsi; normalise anything else.
const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/×/g, "x").replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—•€]/g, "");

export async function cvPdf(markdown: string, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title); doc.setAuthor(title.split(" - ")[0] ?? ""); doc.setCreator("Job Agent");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 48, maxW = W - 2 * M;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };

  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const out: string[] = []; let line = "";
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = word; } else line = next;
    }
    if (line) out.push(line);
    return out;
  };
  // Draw a line with **bold** segments
  const drawRich = (text: string, x: number, size: number, width: number) => {
    const plain = text.replace(/\*\*/g, "");
    const lines = wrap(plain, regular, size, width);
    const boldSpans = [...text.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]);
    for (const l of lines) {
      if (y < M + size) newPage();
      let cx = x;
      // bold the leading span if this line starts with it
      const b = boldSpans.find((s) => l.startsWith(s));
      if (b) { page.drawText(b, { x: cx, y, size, font: bold }); cx += bold.widthOfTextAtSize(b, size); }
      let rest = b ? l.slice(b.length) : l;
      if (b && /^\s/.test(rest)) { cx += regular.widthOfTextAtSize(" ", size); rest = rest.trimStart(); }
      page.drawText(rest, { x: cx, y, size, font: regular });
      y -= size * 1.35;
    }
  };

  for (const raw of markdown.split("\n")) {
    const line = clean(raw);
    if (line.startsWith("# ")) {
      page.drawText(line.slice(2), { x: M, y: y - 4, size: 20, font: bold }); y -= 28;
    } else if (line.startsWith("## ")) {
      y -= 6; if (y < M + 40) newPage();
      page.drawText(line.slice(3).toUpperCase(), { x: M, y, size: 10.5, font: bold, color: rgb(0.1, 0.2, 0.55) });
      y -= 4; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rgb(0.75, 0.78, 0.85) }); y -= 13;
    } else if (line.startsWith("- ")) {
      if (y < M + 12) newPage();
      page.drawText("•", { x: M + 4, y, size: 9.5, font: regular });
      drawRich(line.slice(2), M + 16, 9.5, maxW - 16);
    } else if (line.trim()) {
      drawRich(line, M, 9.5, maxW);
    } else y -= 3;
  }
  return doc.save();
}
