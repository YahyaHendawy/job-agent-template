/** Device-side outbox: answers typed while offline are kept here and sent when the connection returns. */
export type Pending = { appId: string; key: string; question: string; answer: string; savedAt: string };
const KEY = "ja-outbox-v1";

export function readOutbox(): Pending[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(list: Pending[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ } }

export function queueAnswer(p: Omit<Pending, "savedAt">) {
  const list = readOutbox().filter((x) => !(x.appId === p.appId && x.key === p.key));
  list.push({ ...p, savedAt: new Date().toISOString() });
  write(list);
  window.dispatchEvent(new Event("ja-outbox"));
}

export function pendingFor(appId: string, key: string) {
  return readOutbox().find((x) => x.appId === appId && x.key === key) ?? null;
}

let flushing = false;
/** Sends everything waiting. Returns how many were delivered. */
export async function flushOutbox(): Promise<number> {
  const list = readOutbox();
  if (!list.length || flushing || !navigator.onLine) return 0;
  flushing = true;
  try {
    const r = await fetch("/api/answers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: list }) });
    if (!r.ok) return 0;
    const { done } = (await r.json()) as { done: string[] };
    const sent = new Set(done);
    // keep anything typed while this request was in flight
    write(readOutbox().filter((x) => !sent.has(`${x.appId}:${x.key}`) || list.find((y) => y.appId === x.appId && y.key === x.key)?.savedAt !== x.savedAt));
    window.dispatchEvent(new Event("ja-outbox"));
    return sent.size;
  } catch { return 0; } finally { flushing = false; }
}
