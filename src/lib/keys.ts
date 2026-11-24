/**
 * App secrets without typing anything: when an env var isn't set, it is derived from a secret that the
 * Supabase integration already put into this deployment's environment. Derived secrets are
 * never stored in the database, so a database leak alone can't decrypt anything.
 * Values set explicitly in the environment always win, so existing copies keep their keys.
 */
import { createHmac, createECDH } from "node:crypto";

function root(): string | null {
  return process.env.JOB_AGENT_ROOT_SECRET || process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.POSTGRES_PASSWORD || null;
}
const derive = (r: string, label: string) => createHmac("sha256", r).update(`job-agent:${label}`).digest();
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function secret(name: "CRON_SECRET" | "SECRETS_KEY" | "BACKUP_KEY"): string | undefined {
  if (process.env[name]) return process.env[name];
  const r = root();
  if (!r) return undefined;
  const k = derive(r, name);
  return name === "CRON_SECRET" ? k.toString("hex") : k.toString("base64");
}

let vapidCache: { publicKey: string; privateKey: string } | null = null;
/** Web Push keys (P-256). Derived deterministically so every server instance agrees on them. */
export function vapidKeys(): { publicKey: string; privateKey: string } | null {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  if (vapidCache) return vapidCache;
  const r = root();
  if (!r) return null;
  for (let i = 0; i < 8; i++) {
    const priv = derive(r, `vapid:${i}`);
    try {
      const ecdh = createECDH("prime256v1");
      ecdh.setPrivateKey(priv);
      vapidCache = { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(priv) };
      return vapidCache;
    } catch { /* out of curve range (astronomically rare): try the next counter */ }
  }
  return null;
}

/** This deployment's public address. */
export function appUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return null;
}
