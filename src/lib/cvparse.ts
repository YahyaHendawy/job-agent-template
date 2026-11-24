/**
 * Reads a CV (DOCX, simple PDF or pasted text) and SUGGESTS facts. Nothing is invented and nothing is
 * saved until the owner ticks each fact in onboarding. Text is split into the CV's own sections and
 * lines, and contact details are found with plain patterns. No AI, no external service.
 */
import { inflateRawSync, inflateSync } from "node:zlib";

/** Minimal ZIP reader (DOCX is a zip): returns one entry's bytes. */
function unzipEntry(buf: Buffer, name: string): Buffer | null {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const n = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");
    if (n === name) {
      const lnlen = buf.readUInt16LE(local + 26), lelen = buf.readUInt16LE(local + 28);
      const data = buf.subarray(local + 30 + lnlen + lelen, local + 30 + lnlen + lelen + csize);
      return method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data) : null;
    }
    p += 46 + nlen + elen + clen;
  }
  return null;
}

const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function docxText(buf: Buffer): string {
  const xml = unzipEntry(buf, "word/document.xml")?.toString("utf8");
  if (!xml) return "";
  return xml.split(/<\/w:p>/).map((para) => decodeXml([...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>/g)].map((m) => m[1] ?? "\t").join(""))).join("\n");
}

/** Best-effort text from simple PDFs (text operators in Flate streams). Scanned/complex PDFs return "". */
function pdfText(buf: Buffer): string {
  const s = buf.toString("latin1");
  const out: string[] = [];
  for (const m of s.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body = Buffer.from(m[1], "latin1");
    try { body = inflateSync(body); } catch { /* not compressed */ }
    const t = body.toString("latin1");
    if (!/T[jJ]/.test(t)) continue;
    let line = "";
    for (const op of t.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj|\[(?:[^\]])*\]\s*TJ|T\*|Td|TD|ET/g)) {
      const x = op[0];
      if (/^(T\*|Td|TD|ET)$/.test(x)) { if (line.trim()) out.push(line); line = ""; continue; }
      for (const str of x.matchAll(/\(((?:\\.|[^\\)])*)\)/g))
        line += str[1].replace(/\\([nrtbf()\\])/g, (_a, c) => ({ n: "\n", r: "", t: "\t", b: "", f: "", "(": "(", ")": ")", "\\": "\\" } as Record<string, string>)[c]);
    }
    if (line.trim()) out.push(line);
  }
  const text = out.join("\n");
  // Custom-encoded fonts give gibberish: only trust it if it mostly looks like words.
  return (text.match(/[A-Za-z]{3,}/g) ?? []).length > 30 ? text : "";
}

export function extractCvText(buf: Buffer, filename: string): string {
  const f = filename.toLowerCase();
  if (f.endsWith(".docx")) return docxText(buf);
  if (f.endsWith(".pdf")) return pdfText(buf);
  return buf.toString("utf8");
}

export type CvSection = { heading: string; kind: "education" | "experience" | "projects" | "skills" | "leadership" | "other"; lines: string[] };
export type CvSuggestions = { name?: string; email?: string; phone?: string; linkedin?: string; github?: string; sections: CvSection[] };

const HEADINGS: [RegExp, CvSection["kind"]][] = [
  [/^(education|academic|qualifications)/i, "education"],
  [/^(experience|work|employment|professional experience|work experience|volunteering|volunteer)/i, "experience"],
  [/^(projects?|technical projects|academic projects)/i, "projects"],
  [/^(skills|technical skills|core skills|key skills|languages|tools)/i, "skills"],
  [/^(leadership|positions of responsibility|extra.?curricular|activities|achievements|awards|certifications?|memberships?)/i, "leadership"],
  [/^(profile|summary|personal statement|about me|objective|interests|hobbies|references)/i, "other"],
];

export function suggestFacts(text: string): CvSuggestions {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").replace(/^[•●▪◦\-–*·]\s*/, "").trim()).filter(Boolean);
  const all = lines.join("\n");
  const email = all.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
  const phone = all.match(/(\+?\d[\d ()-]{8,}\d)/)?.[1]?.trim();
  const linkedin = all.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i)?.[0];
  const github = all.match(/(?:https?:\/\/)?github\.com\/[A-Za-z0-9_-]+/i)?.[0];
  const first = lines.find((l) => /^[A-Za-zÀ-ÿ' -]{3,40}$/.test(l) && l.split(" ").length <= 4);
  const sections: CvSection[] = [];
  let cur: CvSection | null = null;
  for (const l of lines) {
    const h = l.length < 40 && !/[.@]/.test(l) ? HEADINGS.find(([re]) => re.test(l.replace(/[:|]/g, "").trim())) : undefined;
    if (h) { cur = { heading: l.replace(/[:|]/g, "").trim(), kind: h[1], lines: [] }; sections.push(cur); continue; }
    if (!cur) continue; // header block (name/contact) is handled above
    if (l.length > 2) cur.lines.push(l.slice(0, 400));
  }
  return { name: first, email, phone, linkedin, github, sections: sections.filter((s) => s.lines.length) };
}

/** Skills found in the CV text from a vocabulary (only words that literally appear in the CV). */
export function skillsInText(text: string, vocab: string[]): string[] {
  const t = text.toLowerCase();
  return [...new Set(vocab.filter((v) => new RegExp(`(^|[^a-z0-9+#])${v.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9+#])`).test(t)))];
}
export const COMMON_SKILLS = ["Python", "Java", "JavaScript", "TypeScript", "C", "C++", "C#", "SQL", "MATLAB", "R", "Excel", "PowerPoint", "Word", "Power BI", "Tableau",
  "AutoCAD", "SolidWorks", "Fusion 360", "ANSYS", "Simulink", "LTspice", "Multisim", "Arduino", "Raspberry Pi", "PCB design", "KiCad", "Altium", "Verilog", "VHDL", "FPGA",
  "Git", "Linux", "HTML", "CSS", "React", "Node.js", "AWS", "Azure", "Figma", "Photoshop", "Canva", "Salesforce", "SAP", "Customer service", "Teamwork", "Leadership",
  "Communication", "Problem solving", "Project management", "Data analysis", "Machine learning", "Soldering", "Oscilloscope", "Multimeter"];
