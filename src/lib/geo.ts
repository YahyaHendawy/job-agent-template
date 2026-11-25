/**
 * Turns job locations ("Bristol, UK", "M1 1AE", "Doha, Qatar") into map points, for free:
 *  1. a built-in list of common places (instant),
 *  2. postcodes.io for UK postcodes (free, no key),
 *  3. OpenStreetMap Nominatim for everything else (free, max 1 request a second, results cached forever).
 * Only the place text is sent — never anything about you.
 */
import { pool } from "@/db";

export type Pt = { lat: number; lng: number; precise: boolean; label: string };

const UA = "JobAgent/1.0 (open-source personal job tracker)";

/** Common places, so most jobs map instantly. */
const KNOWN: Record<string, [number, number]> = {
  "london": [51.5074, -0.1278], "central london": [51.5136, -0.1365], "east london": [51.5390, -0.0200], "west london": [51.5060, -0.2800],
  "south west london": [51.4500, -0.1900], "south east london": [51.4600, -0.0300], "north london": [51.5800, -0.1100], "north west london": [51.5600, -0.2300],
  "city of london": [51.5155, -0.0922], "ealing": [51.5130, -0.3089], "richmond": [51.4613, -0.3037], "twickenham": [51.4462, -0.3376],
  "kingston upon thames": [51.4123, -0.3007], "surbiton": [51.3940, -0.3040], "mitcham": [51.4034, -0.1660], "croydon": [51.3762, -0.0982],
  "bristol": [51.4545, -2.5879], "cambridge": [52.2053, 0.1218], "oxford": [51.7520, -1.2577], "manchester": [53.4808, -2.2426],
  "birmingham": [52.4862, -1.8904], "leeds": [53.8008, -1.5491], "glasgow": [55.8642, -4.2518], "edinburgh": [55.9533, -3.1883],
  "worcester": [52.1920, -2.2200], "chesterfield": [53.2350, -1.4210], "cheshunt": [51.7000, -0.0330], "cannock": [52.6910, -2.0270],
  "york": [53.9590, -1.0815], "lincoln": [53.2307, -0.5406], "tewkesbury": [51.9920, -2.1600], "whiteley": [50.8840, -1.2470],
  "denham": [51.5750, -0.5020], "london colney": [51.7260, -0.3000], "reading": [51.4543, -0.9781], "southampton": [50.9097, -1.4044],
  "derby": [52.9225, -1.4746], "coventry": [52.4068, -1.5197], "sheffield": [53.3811, -1.4701], "nottingham": [52.9548, -1.1581],
  "newcastle": [54.9783, -1.6178], "liverpool": [53.4084, -2.9916], "cardiff": [51.4816, -3.1791], "belfast": [54.5973, -5.9301],
  "doha": [25.2854, 51.5310], "ad dawhah": [25.2854, 51.5310], "ad dawhah municipality": [25.2854, 51.5310], "al wakrah": [25.1659, 51.6038],
  "ar rayyan": [25.2919, 51.4244], "lusail": [25.4300, 51.4900], "ras laffan": [25.9000, 51.5500], "mesaieed": [24.9900, 51.5500], "al khor": [25.6839, 51.5058],
  "cairo": [30.0444, 31.2357], "new cairo": [30.0300, 31.4700], "giza": [30.0131, 31.2089], "maadi": [29.9602, 31.2569],
  "6th of october": [29.9285, 30.9188], "alexandria": [31.2001, 29.9187], "smart village": [30.0710, 31.0170],
};
/** Country centre, used (and marked approximate) when only the country is known. */
const COUNTRY_CENTRE: Record<string, [number, number]> = { UK: [52.8, -1.6], QA: [25.3, 51.2], EG: [30.0, 31.2] };
const COUNTRY_WORDS = /\b(united kingdom|uk|england|scotland|wales|great britain|qatar|egypt|state of qatar|arab republic of egypt)\b/gi;
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

/** Splits "Bristol, UK; Cambridge, UK" into places and cleans each one into a lookup key. */
export function placeKeys(location: string | null, country: string | null): string[] {
  if (!location) return [];
  return location.split(/;|\/| or /i).map((part) => {
    const pc = part.match(POSTCODE);
    if (pc) return `pc:${(pc[1] + pc[2]).toUpperCase()}`;
    const clean = part.replace(/\s+-\s+.*$/, "").replace(COUNTRY_WORDS, "").replace(/\b(head office|placement opportunities|in-office|hybrid|on-?site|remote|multiple locations?)\b/gi, "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    if (!clean.length) return country && COUNTRY_CENTRE[country] ? `cc:${country}` : "";
    // Prefer a part we already know (e.g. "Regent Street, London" -> london); else the first part
    const known = clean.find((c) => KNOWN[c.toLowerCase()]);
    return `pl:${(known ?? clean.join(", ")).toLowerCase()}|${country ?? ""}`;
  }).filter(Boolean);
}

let ready = false;
async function ensure() {
  if (ready) return;
  await pool.query(`create table if not exists geocode (key text primary key, lat double precision, lng double precision, precise boolean not null default true, label text, at timestamptz not null default now())`);
  ready = true;
}

/** Instant answers (built-in list / country centre) without any network call. */
function instant(key: string): Pt | null {
  if (key.startsWith("cc:")) { const cc = key.slice(3), c = COUNTRY_CENTRE[cc]; return c ? { lat: c[0], lng: c[1], precise: false, label: ({ UK: "United Kingdom", QA: "Qatar", EG: "Egypt" } as Record<string, string>)[cc] ?? cc } : null; }
  if (key.startsWith("pl:")) { const name = key.slice(3).split("|")[0]; const k = KNOWN[name]; if (k) return { lat: k[0], lng: k[1], precise: true, label: name.replace(/\b[a-z]/g, (c) => c.toUpperCase()) }; }
  return null;
}

/** Cached points for these keys (instant ones included). */
export async function lookup(keys: string[]): Promise<Map<string, Pt>> {
  await ensure();
  const out = new Map<string, Pt>();
  const rest: string[] = [];
  for (const k of new Set(keys)) { const i = instant(k); if (i) out.set(k, i); else rest.push(k); }
  if (rest.length) {
    const r = await pool.query(`select key, lat, lng, precise, label from geocode where key = any($1) and lat is not null`, [rest]);
    for (const x of r.rows) out.set(x.key, { lat: x.lat, lng: x.lng, precise: x.precise, label: x.label });
  }
  return out;
}

async function getJson(url: string, init?: RequestInit) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10_000);
  try { const r = await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/json", ...(init?.headers ?? {}) } }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}

/** Looks up places that aren't cached yet. Polite: postcodes in one batch, other places one a second. */
export async function geocodePending(maxPlaces = 25, budgetMs = 40_000) {
  await ensure();
  // One run at a time, so OpenStreetMap never gets more than 1 request a second; a stuck lock expires after 2 minutes
  const lock = await pool.query(`insert into geocode (key, at) values ('~lock', now()) on conflict (key) do update set at = now() where geocode.at < now() - interval '2 minutes' returning key`);
  if (!lock.rowCount) return 0;
  try { return await lookupPending(maxPlaces, budgetMs); }
  finally { await pool.query(`update geocode set at = now() - interval '1 hour' where key = '~lock'`).catch(() => {}); }
}

async function lookupPending(maxPlaces: number, budgetMs: number) {
  const t0 = Date.now();
  const jobs = (await pool.query(`select distinct location, country from jobs where listing_status = 'open' and not dismissed and location is not null`)).rows;
  const keys = [...new Set(jobs.flatMap((j) => placeKeys(j.location, j.country)))].filter((k) => !instant(k));
  if (!keys.length) return 0;
  const have = new Set((await pool.query(`select key from geocode where key = any($1) and (lat is not null or at > now() - interval '30 days')`, [keys])).rows.map((r) => r.key));
  const todo = keys.filter((k) => !have.has(k));
  const save = (key: string, p: { lat: number; lng: number; precise?: boolean; label?: string } | null) =>
    pool.query(`insert into geocode (key, lat, lng, precise, label, at) values ($1,$2,$3,$4,$5,now()) on conflict (key) do update set lat = excluded.lat, lng = excluded.lng, precise = excluded.precise, label = excluded.label, at = now()`,
      [key, p?.lat ?? null, p?.lng ?? null, p?.precise ?? true, p?.label ?? null]);
  let n = 0;
  // 1) UK postcodes in one request
  const pcs = todo.filter((k) => k.startsWith("pc:")).slice(0, 100);
  if (pcs.length) {
    const d = await getJson("https://api.postcodes.io/postcodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postcodes: pcs.map((k) => k.slice(3)) }) });
    for (const row of d?.result ?? []) {
      const key = `pc:${String(row.query).replace(/\s/g, "").toUpperCase()}`;
      await save(key, row.result ? { lat: row.result.latitude, lng: row.result.longitude, label: `${row.result.postcode} · ${row.result.admin_district ?? ""}` } : null); n++;
    }
  }
  // 2) Other places: OpenStreetMap, one a second
  const names = { UK: "gb", QA: "qa", EG: "eg" } as Record<string, string>;
  for (const key of todo.filter((k) => k.startsWith("pl:")).slice(0, maxPlaces)) {
    if (Date.now() - t0 > budgetMs) break;
    const [name, cc] = key.slice(3).split("|");
    const q = new URLSearchParams({ q: name, format: "jsonv2", limit: "1", ...(names[cc] ? { countrycodes: names[cc] } : {}) });
    const d = await getJson(`https://nominatim.openstreetmap.org/search?${q}`);
    if (!Array.isArray(d)) break; // network error or rate limit: try again on the next run
    const hit = d[0] ?? null;
    await save(key, hit ? { lat: Number(hit.lat), lng: Number(hit.lon), label: String(hit.display_name ?? name).split(",").slice(0, 2).join(",") } : null); n++;
    await new Promise((r) => setTimeout(r, 1100));
  }
  return n;
}
