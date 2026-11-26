import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { pool } from "@/db";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const COOKIE = "sid";
const SESSION_DAYS = 90;
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, s, k] = stored.split("$");
  if (alg !== "scrypt" || !s || !k) return false;
  const key = await scrypt(pw, Buffer.from(s, "base64"), 64, SCRYPT);
  const expected = Buffer.from(k, "base64");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

export async function clientInfo() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
    userAgent: h.get("user-agent"),
  };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const { ip, userAgent } = await clientInfo();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await pool.query(
    `insert into sessions (id, user_id, user_agent, ip, expires_at) values ($1,$2,$3,$4,$5)`,
    [sha256(token), userId, userAgent, ip, expires],
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", expires,
    secure: process.env.NODE_ENV === "production",
  });
}

export type CurrentUser = { id: string; email: string; name: string; sessionId: string };

export async function currentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const sid = sha256(token);
  const r = await pool.query(
    `select u.id, u.email, u.name, s.id as sid, s.last_seen_at from sessions s join users u on u.id = s.user_id
     where s.id = $1 and s.revoked_at is null and s.expires_at > now() and (s.last_seen_at is null or s.last_seen_at > now() - interval '30 days')`,
    [sid],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000)
    await pool.query(`update sessions set last_seen_at = now() where id = $1`, [sid]);
  return { id: row.id, email: row.email, name: row.name, sessionId: row.sid };
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function destroySession() {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (token) await pool.query(`update sessions set revoked_at = now() where id = $1`, [sha256(token)]);
  c.delete(COOKIE);
}

export async function ownerExists() {
  const r = await pool.query(`select 1 from users limit 1`);
  return r.rowCount! > 0;
}

/** Brute-force protection: max 8 failures per IP and 30 overall (any IP) per 15 minutes, for sign-in and set-up. */
export async function loginBlocked(ip: string | null) {
  const r = await pool.query(
    `select count(*) filter (where ip is not distinct from $1)::int as mine, count(*)::int as total
     from audit_log where action in ('login_failed', 'setup_failed') and ts > now() - interval '15 minutes'`, [ip]);
  return r.rows[0].mine >= 8 || r.rows[0].total >= 30;
}

/** Runs sign-in/set-up attempts one at a time, so a burst of requests can't all slip past the limit. */
export async function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query(`select pg_advisory_lock(7310)`); return await fn(); }
  finally { await c.query(`select pg_advisory_unlock(7310)`).catch(() => {}); c.release(); }
}

let dummyHash: string | null = null;
/** Checks a password in the same time whether or not the account exists (so timing can't reveal the email). */
export async function verifyOrDummy(pw: string, stored: string | null | undefined) {
  dummyHash ??= await hashPassword(randomBytes(16).toString("hex"));
  const ok = await verifyPassword(pw, stored ?? dummyHash);
  return ok && !!stored;
}

/** Constant-time comparison of two strings. */
export function sameSecret(a: string, b: string) {
  const x = createHash("sha256").update(a).digest(), y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** For JSON API routes: rejects cross-site requests. */
export async function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) throw new Response("Forbidden", { status: 403 });
}

/** Browser-extension auth: `Authorization: Bearer <token>` checked against hashed api_tokens. */
export async function tokenUser(req: Request): Promise<{ id: string; tokenId: string } | null> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/);
  if (!m) return null;
  const r = await pool.query(
    `update api_tokens set last_used_at = now() where token_hash = $1 and revoked_at is null and created_at > now() - interval '365 days' returning id, user_id`, [sha256(m[1])]);
  return r.rows[0] ? { id: r.rows[0].user_id, tokenId: r.rows[0].id } : null;
}

export async function createApiToken(userId: string, label: string) {
  const token = `ja_${randomBytes(32).toString("base64url")}`;
  await pool.query(`insert into api_tokens (user_id, token_hash, label) values ($1, $2, $3)`, [userId, sha256(token), label]);
  return token;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
};
