import { getHalal, halalCheck, applyHalal } from "@/lib/halal";
import { getBlocked, isBlockedEmployer, blockedRegex } from "@/lib/blocked";
import { short, inDays, whenLondon, plural } from "@/lib/notify-text";
import { createHash } from "node:crypto";
import { pool } from "@/db";
import { FETCHERS, type RawJob, type SourceRow } from "@/connectors";
import { evaluate } from "@/matching";
import { getProfile } from "@/profile";
import { emit, setActivity } from "@/lib/events";
import { enqueue } from "@/lib/queue";
import { getSettings } from "@/lib/settings";

const fp = (...parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 40);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function startCycle(slot: string, trigger: string) {
  const busy = await pool.query(`select count(*)::int n from tasks where type in ('check_source','cycle_complete') and status in ('queued','running')`);
  if (busy.rows[0].n > 0) {
    await emit({ type: "search_started", title: "Search already in progress", body: `Skipped a second search (${trigger}); the current one is still running.`, push: false });
    return;
  }
  const r = await pool.query(`select id, employer from sources where enabled order by employer`);
  const { politeDelayMs } = (await getSettings()).search;
  await emit({
    type: "search_started", title: `Search cycle started (${r.rowCount} sources)`,
    body: `Trigger: ${trigger}. Checking employer boards and saved searches.`, data: { slot },
  });
  await setActivity(`Search cycle ${slot}: checking ${r.rowCount} sources`);
  let i = 0;
  for (const s of r.rows) {
    await enqueue("check_source", { sourceId: s.id, slot }, {
      dedupeKey: `check:${s.id}:${slot}`, runAt: new Date(Date.now() + i++ * politeDelayMs),
    });
  }
  await enqueue("cycle_complete", { slot, startedAt: new Date().toISOString(), sources: r.rowCount }, {
    dedupeKey: `cycle_complete:${slot}`, runAt: new Date(Date.now() + i * politeDelayMs + 90_000),
  });
}

export async function checkSource(sourceId: string, attempt: number, maxAttempts: number) {
  const sr = await pool.query(`select id, kind, token, employer, config from sources where id = $1 and enabled`, [sourceId]);
  const src: SourceRow | undefined = sr.rows[0];
  if (!src) return;
  const fetcher = FETCHERS[src.kind];
  if (!fetcher) throw new Error(`No connector for ${src.kind}`);
  await setActivity(`Checking ${src.employer}${["reed", "adzuna", "jooble", "careerjet"].includes(src.kind) ? ` — ${src.token}` : ""}`);
  const profile = await getProfile();
  const isAgg = ["reed", "adzuna", "jooble", "careerjet"].includes(src.kind);

  let raw: RawJob[];
  try {
    raw = await fetcher(src, { detailFilter: (j) => evaluate(j, profile, { aggregatorQuery: isAgg }).relevant });
  } catch (e: any) {
    await pool.query(
      `update sources set last_checked_at = now(), last_status = $2, consecutive_failures = consecutive_failures + 1 where id = $1`,
      [src.id, String(e.message).slice(0, 300)],
    );
    if (attempt >= maxAttempts) {
      await emit({ type: "source_failed", level: "error", title: `Could not check ${src.employer}`, body: `${e.message}. Giving up for this cycle after ${attempt} attempts.`, data: { sourceId } });
    } else {
      await emit({ type: "retry_scheduled", level: "warning", title: `Retry scheduled: ${src.employer}`, body: `${e.message} (attempt ${attempt}/${maxAttempts}).`, push: false });
    }
    throw e;
  }

  let newCount = 0, relevantCount = 0, updated = 0;
  const seenIds: string[] = [];
  // Employers the owner never wants (Settings → blockedEmployers), e.g. Palantir: never saved, shown or prepared.
  const blocked = await getBlocked();
  const halal = await getHalal();
  const isBlocked = (emp: string) => isBlockedEmployer(emp, blocked);
  for (const j of raw) {
    if (isBlocked(j.employer ?? "")) continue;
    if (halalCheck({ title: j.title, employer: j.employer ?? "", description: j.description }, halal).blocked) continue; // nothing haram
    const ev = evaluate(j, profile, { aggregatorQuery: isAgg });
    if (!ev.relevant) continue;
    relevantCount++;
    const f = fp(src.kind, src.token, j.externalId);
    seenIds.push(f);
    const existing = await pool.query(`select id, deadline, listing_status from jobs where fingerprint = $1`, [f]);
    if (existing.rows[0]) {
      const ex = existing.rows[0];
      await pool.query(
        `update jobs set last_seen_at = now(), last_verified_at = now(), listing_status = case when listing_status = 'hidden' and coalesce(notes, '') like '%duplicate%' then 'hidden' else 'open' end, closed_at = null,
           title = $2, location = $3, description = coalesce($4, description), application_url = $5, salary = coalesce($6, salary),
           deadline = coalesce($7, deadline), eligibility = $8, eligibility_reasons = $9, missing_evidence = $10,
           match_score = $11, match_reasons = $12, country = $13, category = $14, updated_at = now()
         where id = $1`,
        [ex.id, j.title, j.location, j.description || null, j.applicationUrl, j.salary ?? null, j.deadline ?? null,
         ev.eligibility.status, JSON.stringify(ev.eligibility.reasons), JSON.stringify(ev.eligibility.missing),
         ev.score, JSON.stringify(ev.scoreReasons), ev.country, ev.category],
      );
      updated++;
      if (j.deadline && ex.deadline && new Date(ex.deadline).getTime() !== j.deadline.getTime()) {
        await emit({ type: "deadline_changed", title: `Deadline changed: ${j.title} — ${j.employer}`, body: `New deadline ${j.deadline.toUTCString()}`, jobId: ex.id });
      }
      continue;
    }
    // Cross-source duplicate (same employer + title + country already stored from another source)
    const dup = await pool.query(
      `select id from jobs where lower(regexp_replace(employer, '[^a-zA-Z0-9]+', ' ', 'g')) = $1
         and lower(regexp_replace(title, '[^a-zA-Z0-9]+', ' ', 'g')) = $2 and country = $3 and listing_status = 'open' limit 1`,
      [norm(j.employer), norm(j.title), ev.country],
    );
    // Same job advertised for several areas ("Cleaner in Fulham", "Cleaner in Camden"…) counts once.
    const base = (t: string) => norm(t).replace(/\b(in|at|near)\b.*$/, "").replace(/\s+(full|part) time.*$/, "").trim().split(" ").slice(0, 6).join(" ");
    if (!dup.rows[0] && isAgg) {
      const same = await pool.query(`select id, title from jobs where lower(employer) = lower($1) and country = $2 and listing_status = 'open' limit 200`, [j.employer, ev.country]);
      const hit = same.rows.find((r) => base(r.title) === base(j.title) && base(j.title).length > 3);
      if (hit) { await pool.query(`update jobs set last_seen_at = now(), last_verified_at = now() where id = $1`, [hit.id]); continue; }
    }
    if (dup.rows[0]) {
      await pool.query(`update jobs set last_seen_at = now(), last_verified_at = now() where id = $1`, [dup.rows[0].id]);
      continue;
    }
    const ins = await pool.query(
      `insert into jobs (fingerprint, source_id, external_id, employer, title, location, country, category, employment_type,
         salary, deadline, application_url, source_url, description, listing_status, last_verified_at, last_seen_at,
         eligibility, eligibility_reasons, missing_evidence, match_score, match_reasons, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'open',now(),now(),$15,$16,$17,$18,$19,$20)
       on conflict (fingerprint) do nothing returning id`,
      [f, src.id, j.externalId, j.employer, j.title, j.location, ev.country, ev.category, j.employmentType ?? null,
       j.salary ?? null, j.deadline ?? null, j.applicationUrl, j.sourceUrl, j.description, ev.eligibility.status,
       JSON.stringify(ev.eligibility.reasons), JSON.stringify(ev.eligibility.missing), ev.score,
       JSON.stringify(ev.scoreReasons), JSON.stringify({ postedAt: j.postedAt ?? null, needsDetail: j.needsDetail ?? false })],
    );
    const id = ins.rows[0]?.id;
    if (!id) continue;
    newCount++;
    const eligLabel = ev.eligibility.status.replace(/_/g, " ");
    await emit({
      type: "job_found", level: ev.eligibility.status === "ineligible" ? "info" : "success",
      title: `New: ${j.title} — ${j.employer}`,
      body: `${j.location ?? ev.country} · match ${ev.score}/100 · ${eligLabel}${j.deadline ? ` · deadline ${j.deadline.toDateString()}` : ""}`,
      jobId: id, data: { score: ev.score, eligibility: ev.eligibility.status },
      // Only strong, not-ineligible matches are pushed individually; the rest go to the feed and cycle summary.
      push: ev.score >= 50 && ev.eligibility.status !== "ineligible",
    });
  }

  // Closed-listing detection: the employer's own board is authoritative, so anything missing is closed.
  let closed = 0;
  if (!isAgg) {
    const c = await pool.query(
      `update jobs set listing_status = 'closed', closed_at = now(), updated_at = now()
       where source_id = $1 and listing_status = 'open' and not (fingerprint = any($2::text[])) returning id, title`,
      [src.id, seenIds],
    );
    closed = c.rowCount ?? 0;
    for (const row of c.rows.slice(0, 5))
      await emit({ type: "job_closed", title: `Listing closed: ${row.title} — ${src.employer}`, jobId: row.id, push: false });
  }
  await pool.query(
    `update sources set last_checked_at = now(), last_status = 'ok', last_job_count = $2, consecutive_failures = 0 where id = $1`,
    [src.id, raw.length],
  );
  await emit({
    type: "employer_checked", title: `Checked ${src.employer}${isAgg ? ` (${src.token})` : ""}`,
    body: `${raw.length} listings · ${relevantCount} relevant · ${newCount} new · ${updated} re-verified${closed ? ` · ${closed} closed` : ""}`,
    data: { sourceId, raw: raw.length, relevant: relevantCount, new: newCount, closed },
    push: newCount > 0,
  });
}

export async function completeCycle(slot: string, startedAt: string) {
  const pending = await pool.query(
    `select count(*)::int n from tasks where type = 'check_source' and payload->>'slot' = $1 and status in ('queued','running')`, [slot]);
  if (pending.rows[0].n > 0) {
    // Some checks still running/retrying: look again shortly (new task, same cycle).
    await enqueue("cycle_complete", { slot, startedAt }, { dedupeKey: `cycle_complete:${slot}:${Date.now()}`, runAt: new Date(Date.now() + 60_000) });
    return;
  }
  const s = await pool.query(
    `select count(*) filter (where discovered_at >= $1)::int as new_jobs,
            count(*) filter (where discovered_at >= $1 and match_score >= 60 and eligibility <> 'ineligible')::int as strong,
            count(*) filter (where listing_status = 'open')::int as open_total
     from jobs`, [startedAt]);
  const f = await pool.query(
    `select count(*)::int n from tasks where type = 'check_source' and payload->>'slot' = $1 and status = 'failed'`, [slot]);
  const { new_jobs, strong, open_total } = s.rows[0];
  await pool.query(`update agent_state set last_cycle_at = now() where id = 1`);
  await setActivity(null);
  const prepared = await autoPrepare();
  // One grouped "ready for you" notification once the preparations have run.
  await enqueue("approval_digest", { slot }, { dedupeKey: `digest:${slot}`, runAt: new Date(Date.now() + 120_000) });
  await emit({
    type: "search_completed", level: f.rows[0].n ? "warning" : "success",
    title: `Search cycle complete: ${new_jobs} new jobs (${strong} strong matches)`,
    body: `${open_total} open opportunities tracked.${prepared ? ` Preparing ${prepared} application(s) automatically.` : ""}${f.rows[0].n ? ` ${f.rows[0].n} sources failed.` : ""}`,
    url: "/jobs?sort=new", data: { slot, new_jobs, strong },
  });
}

export async function deadlineScan() {
  const r = await pool.query(
    `select j.id, j.title, j.employer, j.deadline from jobs j
     where j.listing_status = 'open' and j.deadline between now() and now() + interval '3 days'
       and (j.starred or exists (select 1 from applications a where a.job_id = j.id and a.status in ('draft','preparing','awaiting_approval','approved')))`);
  for (const j of r.rows) {
    const day = new Date().toISOString().slice(0, 10);
    const id = await enqueue("noop", {}, { dedupeKey: `deadline:${j.id}:${day}` });
    if (!id) continue; // already notified today
    await emit({ type: "deadline_approaching", level: "warning", title: `⏰ ${j.employer} closes ${inDays(j.deadline)}`, body: `${short(j.title)}\nDeadline: ${whenLondon(j.deadline)}\n👉 Tap to apply now. Everything is prepared.`, jobId: j.id });
  }
}

/** Autonomy: create and prepare applications for strong, open, not-ineligible matches. No approval needed to prepare. */
export async function autoPrepare(): Promise<number> {
  await applyHalal().catch((e) => console.error("[halal]", e)); // safety net before preparing anything
  const { automation } = await getSettings();
  const st = (await pool.query(`select status, emergency_stop from agent_state where id = 1`)).rows[0];
  if (!automation.autoPrepare || st?.emergency_stop || st?.status !== "running") return 0;
  const r = await pool.query(
    `insert into applications (job_id, status, auto_prepared)
     select j.id, 'draft', true from jobs j
     where j.listing_status = 'open' and not j.dismissed and j.eligibility <> 'ineligible' and (j.match_score >= $1 or ($3::boolean and j.category = 'placement'))
       and not (j.employer ~* $4)
       and (j.deadline is null or j.deadline > now())
       and not exists (select 1 from applications a where a.job_id = j.id)
     order by (j.deadline is not null and j.deadline < now() + interval '21 days') desc, j.match_score desc limit $2
     on conflict (job_id) do nothing
     returning id`,
    [automation.autoPrepareMinScore, automation.autoPreparePerCycle, automation.alwaysPreparePlacements !== false, blockedRegex(await getBlocked())]);
  for (const row of r.rows)
    await enqueue("prepare_application", { applicationId: row.id }, { dedupeKey: `prepare:${row.id}` });
  return r.rowCount ?? 0;
}

/** Sends one notification listing applications that are ready and waiting for the owner. */
export async function approvalDigest() {
  const r = await pool.query(
    `update applications a set notified_at = now() from jobs j
     where j.id = a.job_id and a.status = 'awaiting_approval' and a.notified_at is null
     returning a.id, j.title, j.employer, j.match_score, j.deadline`);
  if (!r.rowCount) return;
  const rows = r.rows.sort((x, y) => y.match_score - x.match_score);
  const list = rows.slice(0, 3).map((x) => `• ${x.employer}: ${short(x.title, 45)}`).join("\n");
  const det = (await pool.query(`select value from settings where key = 'applicationDetails'`)).rows[0]?.value ?? {};
  const missingDetails = ["addressLine1", "postcode", "visaExpiry", "earliestStartSummer", "drivingLicence", "unspentConvictions"].filter((k) => !det[k]).length;
  await emit({
    type: "approval_requested", level: "info",
    title: rows.length === 1 ? `🚀 Ready to apply: ${rows[0].employer}` : `🚀 ${rows.length} applications ready to send`,
    body: `${list}${rows.length > 3 ? `\n+${rows.length - 3} more` : ""}\n👉 ${missingDetails ? `First fill in ${plural(missingDetails, "missing detail")}, then tap Apply.` : `Tap, check it, and press Apply (about 5 min${rows.length > 1 ? " each" : ""}).`}`,
    url: rows.length === 1 ? `/applications/${rows[0].id}` : "/applications?tab=approval",
    applicationId: rows.length === 1 ? rows[0].id : null,
  });
}
