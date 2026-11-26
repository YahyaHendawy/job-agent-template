/**
 * "My CV": your own Word CV is kept as the template. Things you add are written into it by copying the
 * formatting of an existing entry in that section, so the export looks exactly like the CV you gave.
 * Additions also go into your profile, so matching and tailored CVs use them.
 */
import { pool } from "@/db";
import { unzip, zip } from "@/lib/docx";

export type CvItem = { id: string; section: string; kind: "entry" | "line"; sublist: string | null; org: string | null; location: string | null; role: string | null; dates: string | null; bullets: string[]; label: string | null; text: string | null; include: boolean; created_at: string };

let ready = false;
export async function ensureCvTables() {
  if (ready) return;
  await pool.query(`create table if not exists cv_source (id int primary key default 1, filename text not null, data bytea not null, uploaded_at timestamptz not null default now())`);
  await pool.query(`create table if not exists cv_additions (id bigserial primary key, section text not null, kind text not null, sublist text, org text, location text, role text, dates text,
    bullets jsonb not null default '[]', label text, text text, include boolean not null default true, created_at timestamptz not null default now())`);
  ready = true;
}
export async function getSource() {
  await ensureCvTables();
  return (await pool.query(`select filename, data, uploaded_at from cv_source where id = 1`)).rows[0] as { filename: string; data: Buffer; uploaded_at: string } | undefined;
}
export async function getItems(): Promise<CvItem[]> {
  await ensureCvTables();
  return (await pool.query(`select id::text, section, kind, sublist, org, location, role, dates, bullets, label, text, include, created_at from cv_additions order by created_at asc, id asc`)).rows;
}

/* ---------- Word XML helpers ---------- */
type Kid = { tag: "w:p" | "w:tbl" | "w:sectPr"; xml: string };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
export const textOf = (xml: string) => unesc((xml.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join(""));
const styleOf = (xml: string) => xml.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
const isBullet = (k: Kid) => k.tag === "w:p" && /<w:numPr>/.test(k.xml);
const isHeading = (k: Kid) => k.tag === "w:p" && /^Heading[23]$/i.test(styleOf(k.xml));
const isPlain = (k: Kid) => k.tag === "w:p" && !isBullet(k) && !isHeading(k) && textOf(k.xml).trim().length > 0;
const isLabel = (k: Kid) => isPlain(k) && /^[^:]{2,30}:$/.test(textOf(k.xml).trim());

function split(body: string): Kid[] {
  const kids: Kid[] = [];
  let i = 0;
  while (i < body.length) {
    const m = /<(w:p|w:tbl|w:sectPr)\b/.exec(body.slice(i));
    if (!m) break;
    const start = i + m.index, tag = m[1] as Kid["tag"];
    const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
    re.lastIndex = start;
    let depth = 0, end = body.length, mm: RegExpExecArray | null;
    while ((mm = re.exec(body))) {
      if (mm[1] === "/") depth--; else if (mm[2] !== "/") depth++;
      if (depth === 0) { end = mm.index + mm[0].length; break; }
    }
    kids.push({ tag, xml: body.slice(start, end) });
    i = end;
  }
  return kids;
}
const clean = (xml: string) => xml.replace(/\sw14:(paraId|textId)="[^"]*"/g, "");
/** Put `value` in the first text of the XML and blank the rest. */
function setText(xml: string, value: string) {
  let first = true;
  return xml.replace(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g, () => { const r = first ? `<w:t xml:space="preserve">${esc(value)}</w:t>` : `<w:t></w:t>`; first = false; return r; });
}
function setCells(tbl: string, values: string[]) {
  let n = 0;
  return tbl.replace(/<w:tc>[\s\S]*?<\/w:tc>|<w:tc\s[\s\S]*?<\/w:tc>/g, (tc) => (n < values.length ? setText(tc, values[n++] ?? "") : setText(tc, "")));
}
function setLine(p: string, label: string | null, text: string) {
  const runs = p.match(/<w:r\b[\s\S]*?<\/w:r>/g) ?? [];
  if (label && runs.length >= 2) {
    let i = 0;
    return p.replace(/<w:r\b[\s\S]*?<\/w:r>/g, (r) => { const v = i === 0 ? `${label}: ` : i === 1 ? text : ""; i++; return setText(r, v); });
  }
  return setText(p, label ? `${label}: ${text}` : text);
}

export type Section = { heading: string; kind: "entry" | "line"; sublists: string[] };
function sections(kids: Kid[]) {
  const out: { heading: string; at: number; end: number }[] = [];
  kids.forEach((k, i) => { if (isHeading(k)) out.push({ heading: textOf(k.xml).trim(), at: i, end: kids.length }); });
  out.forEach((s, i) => { s.end = i + 1 < out.length ? out[i + 1].at : kids.findIndex((k) => k.tag === "w:sectPr") >= 0 ? kids.findIndex((k) => k.tag === "w:sectPr") : kids.length; });
  return out;
}
const docXml = (files: { name: string; data: Buffer }[]) => files.find((f) => f.name === "word/document.xml")!.data.toString("utf8");

/** The sections of your CV and what can be added to each. */
export function outline(source: Buffer): Section[] {
  const xml = docXml(unzip(source));
  const kids = split(xml.slice(xml.indexOf("<w:body>") + 8, xml.indexOf("</w:body>")));
  return sections(kids).filter((s) => s.heading).map((s) => {
    const part = kids.slice(s.at + 1, s.end);
    return { heading: s.heading, kind: part.some((k) => k.tag === "w:tbl") && part.some(isBullet) ? "entry" : "line", sublists: part.filter(isLabel).map((k) => textOf(k.xml).trim().replace(/:$/, "")) };
  });
}

/** Your CV with the additions written in, in the original format. */
export function buildDocx(source: Buffer, items: CvItem[]): { docx: Buffer; preview: { style: string; text: string }[] } {
  const files = unzip(source);
  const xml = docXml(files);
  const head = xml.slice(0, xml.indexOf("<w:body>") + 8), tail = xml.slice(xml.indexOf("</w:body>"));
  let kids = split(xml.slice(head.length, xml.indexOf("</w:body>")));
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const it of items.filter((x) => x.include)) {
    const secs = sections(kids);
    const sec = secs.find((s) => norm(s.heading) === norm(it.section));
    if (!sec) continue;
    const part = kids.slice(sec.at + 1, sec.end);
    if (it.kind === "entry") {
      // Copy the first entry layout in this section (or any section that has one)
      const pool_ = [part, ...secs.map((s) => kids.slice(s.at + 1, s.end))];
      let tbl: Kid | undefined, bullet: Kid | undefined;
      for (const p of pool_) { const t = p.findIndex((k) => k.tag === "w:tbl"); if (t >= 0) { const b = p.slice(t + 1).find(isBullet); if (b) { tbl = p[t]; bullet = b; break; } } }
      if (!tbl || !bullet) continue;
      const add: Kid[] = [{ tag: "w:tbl", xml: clean(setCells(tbl.xml, [it.org ?? "", it.location ?? "", it.role ?? "", it.dates ?? ""])) },
        ...it.bullets.filter((b) => b.trim()).map((b) => ({ tag: "w:p" as const, xml: clean(setText(bullet!.xml, b.trim())) }))];
      kids.splice(sec.at + 1, 0, ...add); // newest first, straight under the heading
    } else {
      const labelAt = it.sublist ? part.findIndex((k) => isLabel(k) && norm(textOf(k.xml).replace(/:$/, "")) === norm(it.sublist!)) : -1;
      if (labelAt >= 0) {
        const sample = part.slice(labelAt + 1).find(isPlain) ?? part[labelAt];
        kids.splice(sec.at + 1 + labelAt + 1, 0, { tag: "w:p", xml: clean(setLine(sample.xml, it.label, it.text ?? "")) });
      } else {
        const plain = part.map((k, i) => ({ k, i })).filter(({ k }) => isPlain(k) && !isLabel(k));
        const anyPlain = plain.at(-1) ?? secs.flatMap((s) => kids.slice(s.at + 1, s.end)).filter((k) => isPlain(k) && !isLabel(k)).map((k) => ({ k, i: part.length - 1 }))[0];
        if (!anyPlain) continue;
        kids.splice(sec.at + 1 + (plain.at(-1)?.i ?? part.length - 1) + 1, 0, { tag: "w:p", xml: clean(setLine(anyPlain.k.xml, it.label, it.text ?? "")) });
      }
    }
  }
  const out = head + kids.map((k) => k.xml).join("") + tail;
  const preview = kids.filter((k) => k.tag !== "w:sectPr").flatMap((k) => k.tag === "w:tbl"
    ? [{ style: "entry", text: (k.xml.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) ?? []).map(textOf).filter(Boolean).join(" · ") }]
    : [{ style: isHeading(k) ? "heading" : isBullet(k) ? "bullet" : /Heading1/i.test(styleOf(k.xml)) ? "name" : "line", text: textOf(k.xml) }]).filter((p) => p.text.trim());
  return { docx: zip(files.map((f) => (f.name === "word/document.xml" ? { name: f.name, data: Buffer.from(out, "utf8") } : f))), preview };
}

/** Keep the profile (used for matching and tailored CVs) in step with what you add. */
export async function syncProfile(item: CvItem, mode: "add" | "remove") {
  const r = await pool.query(`select data from profile where id = 1`);
  if (!r.rows[0]) return;
  const p = r.rows[0].data;
  const strip = (arr: any[]) => (arr ?? []).filter((x: any) => x?.cvAdditionId !== item.id);
  for (const k of ["experience", "leadership", "projects"]) p[k] = strip(p[k]);
  const line = `${item.label ? `${item.label}: ` : ""}${item.text ?? ""}`;
  const skills = (item.text ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  p.activities = (p.activities ?? []).filter((a: string) => a !== line);
  p.skills = p.skills ?? { verified: [], userStated: [] };
  if (/skill/i.test(item.section)) p.skills.userStated = (p.skills.userStated ?? []).filter((s: string) => !skills.includes(s));
  if (mode === "add" && item.include) {
    const sec = item.section.toLowerCase();
    if (item.kind === "entry") {
      const e = { organisation: item.org, role: item.role, location: item.location, dates: item.dates, bullets: item.bullets, source: "user", cvAdditionId: item.id };
      (/(extra|activit|leader|volunt)/.test(sec) ? (p.leadership ??= []) : (p.experience ??= [])).unshift(e);
    } else if (/project/i.test(item.sublist ?? "") || /project/.test(sec)) (p.projects ??= []).unshift({ name: item.label ?? item.text?.slice(0, 40), summary: item.text, source: "user", cvAdditionId: item.id });
    else if (/skill/.test(sec)) p.skills.userStated.push(...skills);
    else (p.activities ??= []).push(line);
  }
  await pool.query(`update profile set data = $1 where id = 1`, [JSON.stringify(p)]);
}
