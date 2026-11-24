/** AES-256-GCM encryption for credentials stored in the database (key: SECRETS_KEY, 32 bytes base64). */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { secret } from "./keys";

function key() {
  const k = Buffer.from(secret("SECRETS_KEY") ?? "", "base64");
  if (k.length !== 32) throw new Error("SECRETS_KEY is not configured");
  return k;
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

export function open(sealed: string): string {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1") throw new Error("Unknown secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8");
}
