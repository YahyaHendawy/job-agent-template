/**
 * Inbox watcher: reads the dedicated job inbox (IMAP, Google app password), classifies new emails,
 * links them to applications, updates application status and notifies the owner when they need to act.
 * Stores only sender, subject, date, category and a short snippet; full emails stay in Gmail.
 */
import { short } from "@/lib/notify-text";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { pool } from "@/db";
import { emit } from "@/lib/events";
import { open } from "@/lib/secretbox";

export type Category = "interview" | "assessment" | "rejection" | "offer" | "received" | "verification" | "recruiter" | "other";

const ATS_DOMAINS = /greenhouse|lever\.co|ashbyhq|workable|smartrecruiters|myworkday|workday|recruitee|breezy|teamtailor|successfactors|taleo|icims|jobvite|bamboohr|personio|hirevue|hackerrank|codility|pymetrics|arctic shores|cappfinity|sova|tal(ent)?|careers|recruit|hiring|jobs@|talent/i;

export function classify(subject: string, text: string, from: string, bulk = false): Category {
  const s = `${subject}\n${text.slice(0, 4000)}`.toLowerCase();
  const subj = subject.toLowerCase();
  // Verification: decided by the subject line (marketing footers often say "confirm your email"),
  // or a real code in a non-marketing email.
  if (/(verify|confirm|activate)\b.{0,25}\b(email|account|address)|verification code|security code|one[- ]time (code|password)/.test(subj)) return "verification";
  if (!bulk && /\b(verification|security|one[- ]time) code\b/.test(s)) return "verification";
  if (/\b(unfortunately|regret to inform|not (be )?(moving|progressing|proceeding) (forward|further)|unsuccessful|decided not to (progress|proceed|move)|other candidates|will not be (taking|progressing)|position has been filled)\b/.test(s)) return "rejection";
  if (/\b(pleased to offer|offer of employment|job offer|offer letter|we('d| would) like to offer you)\b/.test(s)) return "offer";
  if (/\b(online (test|assessment)|assessment (centre|center|link)|complete (the|an|your) (assessment|test|task|challenge)|hackerrank|codility|hirevue|pymetrics|cappfinity|arctic shores|sova|video interview|situational judgement|aptitude test|psychometric|coding (test|challenge))\b/.test(s)) return "assessment";
  if (/\b(invite you (to|for) (an? )?(interview|call|chat|meeting)|interview (invitation|invite|slot|availability)|schedule (an? |your )?(interview|call)|book (a|your) (slot|time)|phone screen|first[- ]round|next round|meet the team)\b/.test(s)) return "interview";
  if (/\b(thank you for (applying|your application|submitting)|application (has been |was )?(received|submitted)|we('ve| have) received your application)\b/.test(s)) return "received";
  if (ATS_DOMAINS.test(from) || (!bulk && /\b(recruiter|recruitment|talent acquisition|your application|candidate)\b/.test(s))) return "recruiter";
  return "other";
}

const stripCo = (n: string) => n.toLowerCase().replace(/\b(ltd|limited|plc|inc|llc|group|uk|gmbh|technologies|technology|holdings|international)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function matchApplication(fromName: string, fromAddress: string, subject: string, text: string): Promise<string | null> {
  const apps = (await pool.query(
    `select a.id, j.employer, a.updated_at from applications a join jobs j on j.id = a.job_id where a.status not in ('withdrawn') order by a.updated_at desc`)).rows;
  const hay = `${fromName} ${fromAddress.replace(/[@.]/g, " ")} ${subject} ${text.slice(0, 3000)}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const hits = apps.filter((a) => { const e = stripCo(a.employer); return e.length >= 3 && ` ${hay} `.includes(` ${e} `); });
  if (!hits.length) return null;
  hits.sort((x, y) => stripCo(y.employer).length - stripCo(x.employer).length);
  return hits[0].id;
}

export async function imapCreds(): Promise<{ user: string; pass: string } | null> {
  const r = await pool.query(`select value from settings where key = 'emailImap'`);
  const v = r.rows[0]?.value;
  if (!v?.user || !v?.sealed) return null;
  return { user: v.user, pass: open(v.sealed) };
}

export async function testImap(user: string, pass: string) {
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();
  const status: any = await client.status("INBOX", { messages: true });
  await client.logout();
  return status?.messages ?? 0;
}

const NEEDS = new Set<Category>(["interview", "assessment", "offer", "verification"]);

export async function checkInbox() {
  const creds = await imapCreds();
  if (!creds) return;
  const state = (await pool.query(`select value from settings where key = 'emailState'`)).rows[0]?.value ?? {};
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: creds, logger: false, socketTimeout: 60_000 });
  let processed = 0, actions = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true }); // never marks as read or changes anything
    try {
      const mb = client.mailbox as any;
      const fresh = !state.lastUid || state.uidValidity !== String(mb.uidValidity);
      // First run: only the last 14 days, so old mail doesn't flood the feed.
      const uids: number[] = fresh
        ? ((await client.search({ since: new Date(Date.now() - 14 * 86400_000) }, { uid: true })) || [])
        : ((await client.search({ uid: `${state.lastUid + 1}:*` }, { uid: true })) || []).filter((u: number) => u > state.lastUid);
      let maxUid = state.lastUid ?? 0;
      for (const uid of uids.slice(-40)) {
        const msg = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
        if (!msg || !msg.source) continue;
        maxUid = Math.max(maxUid, uid);
        const p = await simpleParser(msg.source);
        const messageId = p.messageId ?? `${uid}@${mb.uidValidity}`;
        const from = p.from?.value?.[0] ?? { name: "", address: "" };
        const text = (p.text ?? "").replace(/\s+/g, " ").trim();
        const subject = p.subject ?? "";
        // Mailing lists / marketing (List-Unsubscribe header) can still be job emails, but never "verify" or vague "recruiter" items.
        const bulk = !!p.headers.get("list-unsubscribe") || p.headers.get("precedence") === "bulk";
        const category = classify(subject, text, `${from.name} ${from.address}`, bulk);
        const applicationId = ["other", "verification"].includes(category) && !/your application/i.test(subject) ? null
          : await matchApplication(from.name ?? "", from.address ?? "", subject, text);
        const unmatchedRecruiterAsk = category === "recruiter" && /\b(reply|respond|availability|let (us|me) know|next steps|call|chat)\b/i.test(text.slice(0, 2000));
        const needsAction = NEEDS.has(category) || unmatchedRecruiterAsk;
        const link = `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(creds.user)}#search/rfc822msgid%3A${encodeURIComponent(messageId.replace(/[<>]/g, ""))}`;
        const ins = await pool.query(
          `insert into emails (message_id, uid, from_name, from_address, subject, received_at, category, application_id, snippet, link, needs_action)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (message_id) do nothing returning id`,
          [messageId, uid, from.name || null, from.address || null, subject.slice(0, 300), p.date ?? new Date(), category, applicationId, text.slice(0, 400), link, needsAction]);
        if (!ins.rowCount) continue;
        processed++;
        if (category === "other") continue;
        await act(category, { emailId: ins.rows[0].id, applicationId, subject, fromName: from.name || from.address || "", needsAction, fresh, receivedAt: p.date ?? new Date() });
        if (needsAction) actions++;
      }
      await pool.query(`insert into settings (key, value, updated_at) values ('emailState', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [JSON.stringify({ lastUid: maxUid, uidValidity: String(mb.uidValidity), lastCheckedAt: new Date().toISOString(), lastError: null, processed: (state.processed ?? 0) + processed })]);
    } finally { lock.release(); }
    await client.logout();
  } catch (e: any) {
    await pool.query(`insert into settings (key, value, updated_at) values ('emailState', $1, now()) on conflict (key) do update set value = settings.value || excluded.value, updated_at = now()`,
      [JSON.stringify({ lastError: String(e?.responseText ?? e?.message ?? e).slice(0, 300), lastErrorAt: new Date().toISOString() })]);
    if (/auth|credential|invalid/i.test(String(e?.responseText ?? e?.message))) {
      await emit({ type: "info_needed", level: "error", title: "🔌 Job inbox disconnected", body: "Gmail stopped accepting the app password, so I can't see employer emails.\n👉 Tap to paste a new app password (2 minutes).", url: "/settings/email" });
    }
    throw e;
  }
  return { processed, actions };
}

async function act(cat: Category, x: { emailId: string; applicationId: string | null; subject: string; fromName: string; needsAction: boolean; fresh: boolean; receivedAt: Date }) {
  const app = x.applicationId ? (await pool.query(`select a.id, a.status, j.title, j.employer from applications a join jobs j on j.id = a.job_id where a.id = $1`, [x.applicationId])).rows[0] : null;
  const emp = app?.employer ?? x.fromName;
  const role = app ? short(app.title) : `“${short(x.subject, 70)}”`;
  const setStatus = async (s: string, allowed: string[]) => {
    if (app && allowed.includes(app.status)) await pool.query(`update applications set status = $2, updated_at = now() where id = $1`, [app.id, s]);
  };
  // First scan of a newly connected inbox: no notifications for older mail (it still appears in the app).
  const push = !x.fresh || (x.needsAction && Date.now() - new Date(x.receivedAt).getTime() < 2 * 3600_000);
  const url = `/emails/${x.emailId}`;
  switch (cat) {
    case "interview":
      await setStatus("interview", ["awaiting_approval", "approved", "submitted", "assessment"]);
      return emit({ type: "interview_detected", level: "success", title: `🎤 Interview invite: ${emp}`, body: `${role}\n👉 Tap to reply and pick a time. Prep guide is ready in the app.`, applicationId: app?.id, url, push });
    case "assessment":
      await setStatus("assessment", ["awaiting_approval", "approved", "submitted"]);
      return emit({ type: "employer_response", level: "warning", title: `📝 Online test from ${emp}`, body: `${role}\n👉 Tap to see the deadline and free practice tests. Do it a day early.`, applicationId: app?.id, url, push });
    case "offer":
      await setStatus("offer", ["submitted", "assessment", "interview", "approved", "awaiting_approval"]);
      return emit({ type: "employer_response", level: "success", importance: "urgent", title: `🎉 Job offer from ${emp}!`, body: `${role}\n👉 Tap to check it against your visa, then accept or decline.`, applicationId: app?.id, url: app ? `/work/${app.id}` : url, push });
    case "rejection":
      await setStatus("rejected", ["submitted", "assessment", "interview", "approved", "awaiting_approval"]);
      return emit({ type: "employer_response", level: "info", importance: "all", title: `💪 ${emp}: not this time`, body: "That's normal. I'm still searching and preparing new applications for you.", applicationId: app?.id, url: app ? `/applications/${app.id}` : "/activity", push: false });
    case "received":
      if (app && ["awaiting_approval", "approved"].includes(app.status)) {
        await pool.query(`update applications set status = 'submitted', submitted_at = coalesce(submitted_at, now()), submission_evidence = coalesce(submission_evidence, $2), updated_at = now() where id = $1`,
          [app.id, JSON.stringify({ kind: "confirmation_email", reference: x.subject, at: new Date().toISOString() })]);
      }
      return emit({ type: "submission_confirmed", level: "success", title: `📬 ${emp} received your application`, body: `${role}. Nothing to do. I'll tell you when they reply.`, applicationId: app?.id, push: false });
    case "verification":
      return emit({ type: "info_needed", level: "warning", title: `🔗 ${x.fromName} wants you to confirm your email`, body: "👉 Tap, then open the link in the email. Takes 10 seconds.", url, push });
    case "recruiter":
      return emit({ type: x.needsAction ? "info_needed" : "employer_response", level: "info", importance: x.needsAction ? "important" : "all", title: x.needsAction ? `💬 ${emp} is waiting for your reply` : `💬 Recruiter email: ${emp}`, body: `“${short(x.subject, 80)}”${x.needsAction ? "\n👉 Tap to read it and reply from the app." : ""}`, applicationId: app?.id, url, push: push && x.needsAction });
  }
}
