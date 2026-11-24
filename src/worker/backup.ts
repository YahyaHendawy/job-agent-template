/**
 * Weekly encrypted backup of all data to a private Vercel Blob store (a different provider from the
 * Supabase database). AES-256-GCM with BACKUP_KEY, so a leaked file is unreadable without the key.
 * Keeps the last 8 backups. Restore with scripts/restore-backup.ts.
 */
import { createCipheriv, randomBytes } from "node:crypto";
import { secret } from "@/lib/keys";
import { gzipSync } from "node:zlib";
import { put, list, del } from "@vercel/blob";
import { pool } from "@/db";
import { emit } from "@/lib/events";

const TABLES = ["profile", "settings", "sources", "jobs", "applications", "events", "push_subscriptions", "answer_bank", "audit_log", "users"];
const KEEP = 8;

export function encrypt(plain: Buffer, keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("BACKUP_KEY must be 32 bytes (base64)");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([Buffer.from("JA1"), iv, c.getAuthTag(), body]); // magic | iv(12) | tag(16) | ciphertext
}

export async function runBackup() {
  const key = secret("BACKUP_KEY");
  if (!key || !process.env.BLOB_READ_WRITE_TOKEN) {
    await emit({ type: "system_error", level: "warning", title: "Backup skipped", body: "Backup storage or key is not configured.", push: false });
    return;
  }
  const data: Record<string, unknown> = { createdAt: new Date().toISOString(), version: 1 };
  let rows = 0;
  for (const t of TABLES) {
    // users: never back up password hashes in a form that could be reused elsewhere (they are scrypt hashes, but drop anyway)
    const r = await pool.query(t === "users" ? `select id, email, name, created_at from users` : `select * from ${t}`);
    data[t] = r.rows;
    rows += r.rowCount ?? 0;
  }
  const blob = encrypt(gzipSync(Buffer.from(JSON.stringify(data))), key);
  const name = `backups/job-agent-${new Date().toISOString().slice(0, 10)}.json.gz.enc`;
  await put(name, blob, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/octet-stream" });

  const existing = (await list({ prefix: "backups/" })).blobs.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt));
  const old = existing.slice(KEEP);
  if (old.length) await del(old.map((b) => b.url));
  await emit({ type: "agent_control", level: "success", title: "Weekly backup saved", body: `${rows} records, ${(blob.length / 1024).toFixed(0)} KB, encrypted. Keeping the last ${Math.min(existing.length, KEEP)} backups.`, push: false });
}
