const UA = "JobAgent/0.1 (personal job search assistant; low-volume)";

export class HttpError extends Error {
  constructor(public status: number, public url: string, msg?: string) {
    super(msg ?? `HTTP ${status} for ${url}`);
    this.name = "HttpError";
  }
}

export async function getJson<T = any>(url: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new HttpError(res.status, url.replace(/(app_key|app_id)=[^&]+/g, "$1=***"));
    return (await res.json()) as T;
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    const cause = e?.cause?.code ?? e?.cause?.message ?? (e?.name === "AbortError" ? `timeout after ${timeoutMs / 1000}s` : null);
    throw new Error(`Network error${cause ? ` (${cause})` : ""} fetching ${new URL(url).host}`);
  } finally {
    clearTimeout(t);
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let s = decodeEntities(html); // Greenhouse double-escapes
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(s).replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
