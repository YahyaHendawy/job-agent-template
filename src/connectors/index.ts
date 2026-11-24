/**
 * Job-source connectors. Each uses an employer's or job board's official public API
 * (the same feed their careers pages publish). No scraping behind logins, no CAPTCHA bypass.
 */
import { getJson, htmlToText, sleep, HttpError } from "./http";
import { pool } from "@/db";
import { COUNTRIES } from "@/lib/persona";

/** Settings key for a country's Jooble key: UK → joobleUk, QA → joobleQa, IE → joobleIe. */
export const joobleKeyName = (code: string) => `jooble${code.slice(0, 1).toUpperCase()}${code.slice(1).toLowerCase()}`;
const nameOf = (code?: string) => COUNTRIES[code ?? "UK"]?.name ?? "United Kingdom";

/** Job-board API keys: environment first, otherwise the ones the owner saved in Settings → Job sites. */
export async function apiKeys(): Promise<{ reed?: string; adzunaId?: string; adzunaKey?: string; careerjet?: string; joobleQa?: string; joobleEg?: string; joobleUk?: string; [jooble: string]: string | undefined }> {
  const r = await pool.query(`select value from settings where key = 'apiKeys'`).catch(() => ({ rows: [] as any[] }));
  const v = r.rows[0]?.value ?? {};
  return { reed: process.env.REED_API_KEY || v.reed, adzunaId: process.env.ADZUNA_APP_ID || v.adzunaId, adzunaKey: process.env.ADZUNA_APP_KEY || v.adzunaKey,
    careerjet: v.careerjet, ...Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith("jooble"))) as Record<string, string> };
}

export type RawJob = {
  externalId: string;
  title: string;
  employer: string;
  location: string | null;
  countryHint?: string | null;
  description: string | null;
  applicationUrl: string | null;
  sourceUrl: string | null;
  employmentType?: string | null;
  salary?: string | null;
  deadline?: Date | null;
  postedAt?: Date | null;
  aggregator?: boolean;
  needsDetail?: boolean;
};

export type SourceRow = { id: string; kind: string; token: string; employer: string; config: any };
export type Fetcher = (s: SourceRow, opts: { detailFilter?: (j: RawJob) => boolean }) => Promise<RawJob[]>;

const greenhouse: Fetcher = async (s) => {
  const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(s.token)}/jobs?content=true`);
  return (d.jobs ?? []).map((j: any) => ({
    externalId: String(j.id),
    title: j.title,
    employer: s.employer,
    location: j.location?.name ?? null,
    countryHint: (j.offices ?? []).map((o: any) => o.location ?? o.name).join(" "),
    description: htmlToText(j.content),
    applicationUrl: j.absolute_url,
    sourceUrl: `https://boards.greenhouse.io/${s.token}/jobs/${j.id}`,
    postedAt: j.first_published ? new Date(j.first_published) : j.updated_at ? new Date(j.updated_at) : null,
  }));
};

const lever: Fetcher = async (s) => {
  const host = s.config?.region === "eu" ? "api.eu.lever.co" : "api.lever.co";
  const d = await getJson<any[]>(`https://${host}/v0/postings/${encodeURIComponent(s.token)}?mode=json`);
  return d.map((j) => ({
    externalId: j.id,
    title: j.text,
    employer: s.employer,
    location: [j.categories?.location, ...(j.categories?.allLocations ?? [])].filter(Boolean).join(" / ") || null,
    countryHint: j.country ?? null,
    description: [j.descriptionPlain, ...(j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain].filter(Boolean).join("\n\n"),
    applicationUrl: j.applyUrl ?? j.hostedUrl,
    sourceUrl: j.hostedUrl,
    employmentType: j.categories?.commitment ?? null,
    salary: j.salaryRange ? `${j.salaryRange.currency ?? ""} ${j.salaryRange.min}–${j.salaryRange.max} ${j.salaryRange.interval ?? ""}`.trim() : null,
    postedAt: j.createdAt ? new Date(j.createdAt) : null,
  }));
};

const ashby: Fetcher = async (s) => {
  const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(s.token)}?includeCompensation=true`);
  return (d.jobs ?? []).filter((j: any) => j.isListed !== false).map((j: any) => ({
    externalId: j.id,
    title: j.title,
    employer: s.employer,
    location: [j.location, ...(j.secondaryLocations ?? []).map((x: any) => x.location)].filter(Boolean).join(" / "),
    countryHint: j.address?.postalAddress?.addressCountry ?? null,
    description: j.descriptionPlain ?? htmlToText(j.descriptionHtml),
    applicationUrl: j.applyUrl ?? j.jobUrl,
    sourceUrl: j.jobUrl,
    employmentType: j.employmentType ?? null,
    salary: j.compensation?.compensationTierSummary ?? null,
    postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
  }));
};

const smartrecruiters: Fetcher = async (s, { detailFilter }) => {
  const out: RawJob[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const d = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(s.token)}/postings?limit=100&offset=${offset}`);
    for (const j of d.content ?? []) {
      out.push({
        externalId: j.id,
        title: j.name,
        employer: s.employer,
        location: [j.location?.city, j.location?.region, j.location?.country?.toUpperCase?.() === "GB" ? "United Kingdom" : j.location?.country].filter(Boolean).join(", "),
        countryHint: Object.values(COUNTRIES).find((c) => c.iso.includes(String(j.location?.country ?? "").toLowerCase()))?.name ?? j.location?.country,
        description: null,
        applicationUrl: `https://jobs.smartrecruiters.com/${s.token}/${j.id}`,
        sourceUrl: `https://jobs.smartrecruiters.com/${s.token}/${j.id}`,
        employmentType: j.typeOfEmployment?.label ?? null,
        postedAt: j.releasedDate ? new Date(j.releasedDate) : null,
        needsDetail: true,
      });
    }
    if ((d.content ?? []).length < 100) break;
    await sleep(800);
  }
  let details = 0;
  for (const j of out) {
    if (!detailFilter || !detailFilter(j) || details >= 40) continue;
    details++;
    try {
      const d = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(s.token)}/postings/${j.externalId}`);
      const sec = d.jobAd?.sections ?? {};
      j.description = ["companyDescription", "jobDescription", "qualifications", "additionalInformation"]
        .map((k) => htmlToText(sec[k]?.text)).filter(Boolean).join("\n\n");
      j.applicationUrl = d.applyUrl ?? j.applicationUrl;
      j.needsDetail = false;
    } catch { /* keep summary */ }
    await sleep(600);
  }
  return out;
};

/** Workday career sites expose a JSON search endpoint used by their own public pages. */
const workday: Fetcher = async (s, { detailFilter }) => {
  const { host, tenant, site } = s.config as { host: string; tenant: string; site: string };
  const base = `https://${host}/wday/cxs/${tenant}/${site}`;
  const terms: string[] = s.config.searchTerms ?? ["intern", "placement", "student", "graduate", "industrial"];
  const seen = new Map<string, RawJob>();
  for (const q of terms) {
    for (let offset = 0; offset < 100; offset += 20) {
      const d = await getJson(`${base}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: q }),
      });
      for (const j of d.jobPostings ?? []) {
        if (!j.externalPath || seen.has(j.externalPath)) continue;
        seen.set(j.externalPath, {
          externalId: j.externalPath,
          title: j.title,
          employer: s.employer,
          location: j.locationsText ?? null,
          description: null,
          applicationUrl: `https://${host}/${site}${j.externalPath}`,
          sourceUrl: `https://${host}/${site}${j.externalPath}`,
          needsDetail: true,
        });
      }
      if ((d.jobPostings ?? []).length < 20) break;
      await sleep(1000);
    }
    await sleep(1000);
  }
  let details = 0;
  for (const j of seen.values()) {
    if (!detailFilter || !detailFilter(j) || details >= 25) continue;
    details++;
    try {
      const d = await getJson(`${base}${j.externalId}`);
      const info = d.jobPostingInfo ?? {};
      j.description = htmlToText(info.jobDescription);
      j.location = info.location ?? j.location;
      j.countryHint = info.country?.descriptor ?? null;
      j.employmentType = info.timeType ?? null;
      j.applicationUrl = info.externalUrl ?? j.applicationUrl;
      j.needsDetail = false;
    } catch { /* keep summary */ }
    await sleep(800);
  }
  return [...seen.values()];
};

/** Reed.co.uk official API (free key). One source row = one saved search. */
const reed: Fetcher = async (s) => {
  const key = (await apiKeys()).reed;
  if (!key) throw new Error("Reed API key not set (Settings → Job sites)");
  const c = s.config ?? {};
  const qs = new URLSearchParams({ keywords: c.keywords ?? "", resultsToTake: "100" });
  if (c.location) qs.set("locationName", c.location);
  if (c.distance) qs.set("distanceFromLocation", String(c.distance));
  if (c.partTime) qs.set("partTime", "true");
  if (c.temp) qs.set("temp", "true");
  const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");
  // Up to 4 pages (400 results) per search, so nothing past the first page is missed.
  const results: any[] = [];
  for (let page = 0; page < 4; page++) {
    qs.set("resultsToSkip", String(page * 100));
    const d = await getJson(`https://www.reed.co.uk/api/1.0/search?${qs}`, { headers: { Authorization: auth } });
    const got = d.results ?? [];
    results.push(...got);
    if (got.length < 100 || results.length >= (d.totalResults ?? 0)) break;
  }
  const seen = new Set<string>();
  return results.filter((j) => !seen.has(String(j.jobId)) && seen.add(String(j.jobId))).map((j: any) => {
    const [dd, mm, yy] = String(j.expirationDate ?? "").split("/");
    return {
      externalId: String(j.jobId),
      title: j.jobTitle,
      employer: j.employerName,
      location: j.locationName ? `${j.locationName}, United Kingdom` : "United Kingdom",
      description: j.jobDescription,
      applicationUrl: j.jobUrl,
      sourceUrl: j.jobUrl,
      employmentType: [j.partTime && "Part-time", j.fullTime && "Full-time", j.contractType].filter(Boolean).join(", ") || null,
      salary: j.minimumSalary ? `£${j.minimumSalary}${j.maximumSalary && j.maximumSalary !== j.minimumSalary ? `–£${j.maximumSalary}` : ""}` : null,
      deadline: yy ? new Date(`${yy}-${mm}-${dd}T23:59:00Z`) : null,
      aggregator: true,
    } satisfies RawJob;
  });
};

/** Adzuna official API (free key). Supports gb; one source row = one saved search. */
const adzuna: Fetcher = async (s) => {
  const { adzunaId: id, adzunaKey: key } = await apiKeys();
  if (!id || !key) throw new Error("Adzuna keys not set (Settings → Job sites)");
  const c = s.config ?? {};
  const qs = new URLSearchParams({ app_id: id, app_key: key, results_per_page: "50", what: c.keywords ?? "", "content-type": "application/json", max_days_old: "45" });
  if (c.location) qs.set("where", c.location);
  if (c.partTime) qs.set("part_time", "1");
  const d = await getJson(`https://api.adzuna.com/v1/api/jobs/${c.country ?? "gb"}/search/1?${qs}`);
  return (d.results ?? []).map((j: any) => ({
    externalId: String(j.id),
    title: htmlToText(j.title),
    employer: j.company?.display_name ?? "Unknown employer",
    location: `${j.location?.display_name ?? ""}, United Kingdom`,
    description: htmlToText(j.description),
    applicationUrl: j.redirect_url,
    sourceUrl: j.redirect_url,
    employmentType: [j.contract_time, j.contract_type].filter(Boolean).join(", ") || null,
    salary: j.salary_min ? `£${Math.round(j.salary_min)}${j.salary_max && j.salary_max !== j.salary_min ? `–£${Math.round(j.salary_max)}` : ""}${j.salary_is_predicted === "1" ? " (estimated)" : ""}` : null,
    postedAt: j.created ? new Date(j.created) : null,
    aggregator: true,
  }));
};

/** Workable public careers widget feed (used by many Middle East and smaller companies). */
const workable: Fetcher = async (s, { detailFilter }) => {
  const d = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(s.token)}`);
  const jobs: RawJob[] = (d.jobs ?? []).map((j: any) => {
    const loc = j.locations?.[0] ?? {};
    return {
      externalId: j.shortcode,
      title: j.title,
      employer: s.employer,
      location: [j.city ?? loc.city, j.state ?? loc.region, j.country ?? loc.country].filter(Boolean).join(", ") || (j.telecommuting ? "Remote" : null),
      countryHint: loc.countryCode ?? j.country ?? null,
      description: null,
      applicationUrl: j.application_url ?? j.url,
      sourceUrl: j.url ?? `https://apply.workable.com/${s.token}/j/${j.shortcode}/`,
      employmentType: j.employment_type ?? null,
      postedAt: j.published_on ? new Date(j.published_on) : null,
      needsDetail: true,
    };
  });
  let details = 0;
  for (const j of jobs) {
    if (!detailFilter || !detailFilter(j) || details >= 30) continue;
    details++;
    try {
      const x = await getJson(`https://apply.workable.com/api/v2/accounts/${encodeURIComponent(s.token)}/jobs/${j.externalId}`);
      j.description = [x.description, x.requirements, x.benefits].map((h: string) => htmlToText(h)).filter(Boolean).join("\n\n");
      j.needsDetail = false;
    } catch { /* keep summary */ }
    await sleep(600);
  }
  return jobs;
};

/** Recruitee public offers feed. */
const recruitee: Fetcher = async (s) => {
  const d = await getJson(`https://${encodeURIComponent(s.token)}.recruitee.com/api/offers/`);
  return (d.offers ?? []).map((j: any) => ({
    externalId: String(j.id),
    title: j.title,
    employer: s.employer,
    location: [j.city, j.country].filter(Boolean).join(", ") || j.location || null,
    countryHint: j.country_code ?? j.country ?? null,
    description: [htmlToText(j.description), htmlToText(j.requirements)].filter(Boolean).join("\n\n"),
    applicationUrl: j.careers_apply_url ?? j.careers_url,
    sourceUrl: j.careers_url,
    employmentType: j.employment_type_code ?? null,
    postedAt: j.published_at ? new Date(j.published_at) : null,
  }));
};

/** Breezy HR public JSON feed. */
const breezy: Fetcher = async (s) => {
  const d = await getJson<any[]>(`https://${encodeURIComponent(s.token)}.breezy.hr/json`);
  return d.map((j) => ({
    externalId: j.id ?? j.friendly_id,
    title: j.name,
    employer: s.employer,
    location: [j.location?.city, j.location?.country?.name].filter(Boolean).join(", ") || j.location?.name || null,
    countryHint: j.location?.country?.id ?? j.location?.country?.name ?? null,
    description: null,
    applicationUrl: j.url,
    sourceUrl: j.url,
    employmentType: j.type?.name ?? null,
    postedAt: j.published_date ? new Date(j.published_date) : null,
  }));
};

/** Jooble official REST API (free; one key per country portal, 100 requests/day). One source row = one saved search. */
const jooble: Fetcher = async (s) => {
  const c = s.config ?? {};
  const keys = await apiKeys();
  const key = keys[joobleKeyName(c.country ?? "UK")];
  if (!key) throw new Error(`Jooble ${c.country ?? "UK"} key not set (Settings → Job sites)`);
  const host = `${COUNTRIES[c.country ?? "UK"]?.jooble ?? "uk"}.jooble.org`; // each key belongs to its country portal
  // Up to 3 pages (150 results) per search.
  const all: any[] = [];
  for (let page = 1; page <= 3; page++) {
    const d = await getJson(`https://${host}/api/${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: c.keywords ?? "", location: c.location ?? "", page: String(page), ResultOnPage: "50" }),
    });
    const got = d.jobs ?? [];
    all.push(...got);
    if (got.length < 50 || all.length >= (d.totalCount ?? 0)) break;
  }
  const countryName = nameOf(c.country);
  const seen = new Set<string>();
  return all.filter((j) => !seen.has(String(j.id)) && seen.add(String(j.id))).map((j: any) => ({
    externalId: String(j.id),
    title: htmlToText(j.title),
    employer: j.company || "Unknown employer",
    location: j.location ? `${j.location}, ${countryName}` : countryName,
    countryHint: countryName,
    description: htmlToText(j.snippet),
    applicationUrl: j.link, sourceUrl: j.link,
    employmentType: j.type || null,
    salary: j.salary || null,
    postedAt: j.updated ? new Date(j.updated) : null,
    aggregator: true,
  }));
};

/** Careerjet v4 partner API (free publisher account; basic auth with the API key). */
const careerjet: Fetcher = async (s) => {
  const key = (await apiKeys()).careerjet;
  if (!key) throw new Error("Careerjet key not set (Settings → Job sites)");
  const c = s.config ?? {};
  const qs = new URLSearchParams({ locale_code: c.locale ?? "en_GB", keywords: c.keywords ?? "", page_size: "100", sort: "date",
    user_ip: "127.0.0.1", user_agent: "JobAgent/0.1 (scheduled personal job search)" });
  if (c.location) qs.set("location", c.location);
  if (c.contractType) qs.set("contract_type", c.contractType);
  if (c.workHours) qs.set("work_hours", c.workHours);
  const d = await getJson(`https://search.api.careerjet.net/v4/query?${qs}`, {
    headers: { Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64"), Referer: (process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")) + "/jobs" },
  });
  if (d.type && d.type !== "JOBS") throw new Error(`Careerjet: ${d.message ?? d.error ?? d.type}`);
  const countryName = nameOf(c.country);
  return (d.jobs ?? []).map((j: any) => ({
    externalId: (j.url ?? "").split("/").pop() || `${j.title}-${j.company}-${j.date}`,
    title: htmlToText(j.title), employer: j.company || "Unknown employer",
    location: j.locations ? `${j.locations}, ${countryName}` : countryName, countryHint: countryName,
    description: htmlToText(j.description), applicationUrl: j.url, sourceUrl: j.url,
    salary: j.salary || null, postedAt: j.date ? new Date(j.date) : null, aggregator: true,
  }));
};

export const FETCHERS: Record<string, Fetcher> = { greenhouse, lever, ashby, smartrecruiters, workday, workable, recruitee, breezy, reed, adzuna, jooble, careerjet };
export { HttpError };
