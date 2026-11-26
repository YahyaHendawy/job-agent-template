/**
 * Fetching pages from links that come from outside (adverts, pasted links) without letting them reach
 * this server's own network: http(s) only on normal ports, every redirect re-checked, every address
 * resolved and refused if private/loopback/link-local, and a size cap on what's read.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function v4Private(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return v4Private(ip);
  const x = ip.toLowerCase();
  const mapped = x.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? x.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]);
  const hex = x.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) { const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16); return v4Private([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255].join(".")); }
  return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x);
}

export async function safeFetch(raw: string, opts: { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);
  try {
    let url = new URL(raw);
    for (let hop = 0; hop < 5; hop++) {
      if (!["http:", "https:"].includes(url.protocol) || (url.port && !["80", "443"].includes(url.port)) || url.username || url.password) throw new Error("Refused: not a normal web address");
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
      if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("Refused: private address");
      const res = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: opts.headers });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url); continue; }
      const max = opts.maxBytes ?? 1_500_000, chunks: Uint8Array[] = [];
      let size = 0;
      const reader = res.body?.getReader();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) { await reader.cancel(); break; }
        chunks.push(value);
      }
      return { status: res.status, ok: res.ok, url: url.href, text: Buffer.concat(chunks).toString("utf8"), contentType: res.headers.get("content-type") ?? "" };
    }
    throw new Error("Refused: too many redirects");
  } finally { clearTimeout(timer); }
}
