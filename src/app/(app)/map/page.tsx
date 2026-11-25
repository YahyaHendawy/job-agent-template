import Link from "next/link";
import { after } from "next/server";
import { pool } from "@/db";
import { PageHeader, CATEGORY, ELIG, APP_STATUS } from "@/components/ui";
import { ListControls } from "@/components/ListControls";
import { loadPersona, persona, marketOptions } from "@/lib/persona";
import { placeKeys, lookup, geocodePending } from "@/lib/geo";
import { chance, CHANCE_FLAGS_SQL } from "@/lib/chance";
import { unanswered } from "@/lib/written";
import { JobMap, type MapPlace } from "@/components/JobMap";
import { LimitsNote } from "@/components/Limits";

export const dynamic = "force-dynamic";

/** Every open job on a map, with the same search and filters as the lists. */
export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await loadPersona();
  const sp = Object.fromEntries(Object.entries(await searchParams).filter(([, v]) => v)) as Record<string, string>;
  const where: string[] = ["not j.dismissed", "j.listing_status = 'open'"], args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replaceAll("?", `$${args.length}`)); };
  if (sp.q) add(`(j.title ilike ? or j.employer ilike ? or j.location ilike ?)`, `%${sp.q}%`);
  if (sp.category) add(`j.category = ?`, sp.category);
  if (sp.country) add(`j.country = ?`, sp.country);
  if (!sp.elig) where.push(`j.eligibility <> 'ineligible'`); else if (sp.elig !== "any") add(`j.eligibility = ?`, sp.elig);
  if (sp.match) add(`j.match_score >= ?`, Number(sp.match) || 0);
  if (sp.closing) add(`j.deadline between now() and now() + (? || ' days')::interval`, sp.closing);
  if (sp.found) add(`j.discovered_at > now() - (? || ' days')::interval`, sp.found);
  if (sp.stage === "none") where.push(`a.id is null`);
  else if (sp.stage === "decide") where.push(`a.status = 'awaiting_approval'`);
  else if (sp.stage === "going") where.push(`a.status = 'approved'`);
  else if (sp.stage === "sent") where.push(`a.status in ('submitted','assessment','interview','offer')`);
  if (sp.starred) where.push(`j.starred`);

  const r = await pool.query(
    `select j.id, j.title, j.employer, j.location, j.country, j.category, j.match_score, j.eligibility, j.deadline, j.salary, j.discovered_at, ${CHANCE_FLAGS_SQL} as description, j.missing_evidence,
            s.kind as source_kind, a.id as app_id, a.status, a.answers, a.missing_info, a.written, a.form_questions
     from jobs j left join sources s on s.id = j.source_id left join applications a on a.job_id = j.id
     where ${where.join(" and ")} order by j.match_score desc limit 600`, args);
  let rows = r.rows.map((j) => ({ ...j, ch: chance({ ...j, missing_info: j.missing_info ?? j.missing_evidence, unanswered: j.app_id ? unanswered(j).length : null }) }));
  if (sp.chance) rows = rows.filter((j) => sp.chance === "strong" ? j.ch.pct >= 18 : sp.chance === "possible" ? j.ch.pct >= 8 && j.ch.pct < 18 : j.ch.pct < 8);

  const keysOf = rows.map((j) => ({ j, keys: placeKeys(j.location, j.country) }));
  const pts = await lookup(keysOf.flatMap((x) => x.keys));
  const places = new Map<string, MapPlace>();
  let unmapped = 0, remote = 0, noLoc = 0;
  for (const { j, keys } of keysOf) {
    const hit = keys.map((k) => pts.get(k)).filter(Boolean);
    if (!hit.length) { if (/remote/i.test(j.location ?? "")) remote++; else if (!keys.length) noLoc++; else unmapped++; continue; }
    for (const p of hit) {
      const id = `${p!.lat.toFixed(3)},${p!.lng.toFixed(3)}`;
      const place: MapPlace = places.get(id) ?? { id, lat: p!.lat, lng: p!.lng, precise: p!.precise, country: j.country, label: p!.label || (j.location ?? ""), jobs: [] as MapPlace["jobs"] };
      if (!place.jobs.some((x) => x.id === j.id)) place.jobs.push({
        id: j.id, appId: j.app_id, title: j.title, employer: j.employer, location: j.location, match: j.match_score,
        type: CATEGORY[j.category] ?? j.category, elig: ELIG[j.eligibility]?.label ?? j.eligibility, eligColor: ELIG[j.eligibility]?.color ?? "var(--muted)",
        status: j.app_id ? APP_STATUS[j.status] ?? j.status : null, deadline: j.deadline ? new Date(j.deadline).toISOString() : null,
        salary: j.salary, chance: j.ch.pct, chanceLabel: j.ch.label, chanceTone: j.ch.tone,
      });
      places.set(id, place);
    }
  }
  const list = [...places.values()].map((p) => ({ ...p, jobs: p.jobs.sort((a, b) => b.chance - a.chance || (b.match ?? 0) - (a.match ?? 0)) }));
  const mapped = new Set(list.flatMap((p) => p.jobs.map((j) => j.id))).size;
  const total = (await pool.query(`select count(*)::int n from jobs where not dismissed and listing_status = 'open' and eligibility <> 'ineligible'`)).rows[0].n;
  if (unmapped) after(() => geocodePending(15, 20_000).then(() => undefined).catch(() => undefined)); // new places appear on the next visit
  const H = persona().home;

  return (
    <div>
      <PageHeader title="Map" subtitle="Where your jobs are. Pinch to zoom, tap a pin for the jobs there." right={<Link href="/jobs" className="btn btn-ghost !text-sm">List view</Link>} />
      <ListControls action="/map" params={sp} placeholder="Search title, employer, place…" count={rows.length} total={total}
        sorts={[["score", "Best match"]]}
        filters={[
          { name: "category", label: "Type", options: Object.entries(CATEGORY) },
          { name: "country", label: "Country", options: marketOptions() },
          { name: "chance", label: "Chance of getting it", options: [["strong", "Good or strong (18%+)"], ["possible", "Possible (8–17%)"], ["long", "Long shot (under 8%)"]] },
          { name: "stage", label: "Application", options: [["none", "Not prepared yet"], ["decide", "To decide"], ["going", "Going ahead"], ["sent", "Sent or further"]] },
          { name: "elig", label: "Eligibility", all: "Can apply (default)", options: [["any", "Everything, incl. ineligible"], ...Object.entries(ELIG).map(([k, v]) => [k, v.label] as [string, string])] },
          { name: "match", label: "Match", options: [["80", "80%+"], ["60", "60%+"], ["40", "40%+"]] },
          { name: "closing", label: "Deadline", options: [["7", "Closes within 7 days"], ["30", "Closes within 30 days"]] },
          { name: "found", label: "Found", options: [["1", "Last 24 hours"], ["7", "Last 7 days"], ["30", "Last 30 days"]] },
          { name: "starred", label: "Starred", options: [["1", "Starred only"]] },
        ]} />
      <div className="mb-3"><LimitsNote topic="map" max={1} /></div>
      <JobMap places={list} home={H.city ? { label: H.city, country: H.country } : null} />
      <p className="text-xs text-muted mt-2">
        {mapped} of {rows.length} on the map{remote ? ` · ${remote} remote` : ""}{noLoc ? ` · ${noLoc} with no location in the advert` : ""}{unmapped ? ` · ${unmapped} still being located (usually within 30 minutes)` : ""}.
        {" "}Pins marked ≈ show only the country or area. Map © OpenStreetMap contributors.
      </p>
    </div>
  );
}
