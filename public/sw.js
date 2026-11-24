/* Job Agent service worker: offline copy of the app, push notifications and notification taps. */
const VERSION = "v3";
const PAGES = `ja-pages-${VERSION}`;   // your screens (HTML), refreshed every time you're online
const ASSETS = `ja-assets-${VERSION}`; // app code, styles, icons (never change once published)
const CORE = ["/", "/applications", "/jobs", "/guide", "/activity", "/settings/details", "/emails"];
const WARM_EVERY_MS = 20 * 60 * 1000;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(ASSETS).then((c) => c.addAll(["/offline.html", "/icons/icon-192.png", "/manifest.webmanifest"]).catch(() => {})));
});

self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("ja-") && k !== PAGES && k !== ASSETS) await caches.delete(k);
  await self.clients.claim();
})()));

const isAsset = (u) => u.pathname.startsWith("/_next/static/") || u.pathname.startsWith("/icons/") || u.pathname === "/manifest.webmanifest" || u.pathname === "/offline.html";
const pageKey = (u) => new Request(new URL(u.pathname + u.search, self.location.origin).href);

async function savePage(url, res) {
  if (!res || !res.ok || res.type === "opaqueredirect") return;
  const final = new URL(res.url || url.href);
  if (final.pathname.startsWith("/login") || final.pathname.startsWith("/setup")) { await caches.delete(PAGES); return; } // signed out: forget private copies
  if (!(res.headers.get("content-type") || "").includes("text/html")) return;
  const headers = new Headers(res.headers);
  headers.set("x-ja-saved-at", new Date().toISOString());
  const body = await res.clone().arrayBuffer();
  await (await caches.open(PAGES)).put(pageKey(url), new Response(body, { status: 200, headers }));
}

/** Adds a small "offline" strip to a saved page (outside <body>, so the app itself is untouched). */
async function withOfflineBanner(res) {
  const saved = res.headers.get("x-ja-saved-at");
  const when = saved ? new Date(saved).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "earlier";
  const html = await res.text();
  const strip = `<script>(function(){function add(){if(document.getElementById('ja-offline'))return;var d=document.createElement('div');d.id='ja-offline';d.setAttribute('role','status');d.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 84px);z-index:2147483647;background:#1f2430;color:#fff;font:600 13px -apple-system,system-ui,sans-serif;padding:9px 14px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.25);max-width:92vw;text-align:center';d.textContent='📴 Offline · saved copy from ${when}. Answers you type are kept and sent later.';document.documentElement.appendChild(d);addEventListener('online',function(){location.reload()});}if(document.readyState==='loading')addEventListener('DOMContentLoaded',add);else add();})();</script>`;
  const out = html.includes("</html>") ? html.replace(/<\/html>\s*$/, `${strip}</html>`) : html + strip;
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(out, { status: 200, headers });
}

async function offlinePage(url) {
  const c = await caches.open(PAGES);
  const hit = (await c.match(pageKey(url))) || (await c.match(pageKey(new URL(url.pathname, url.origin)), { ignoreSearch: true }));
  if (hit) return withOfflineBanner(hit);
  return (await caches.match("/offline.html")) || new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always live

  if (isAsset(url)) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(ASSETS)).put(req, res.clone());
      return res;
    })());
    return;
  }

  // In-app link taps fetch screen data (RSC). Offline, fail fast so the app falls back to a full page load,
  // which is then answered from the saved copy below.
  if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(fetch(req).catch(() => Response.error()));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        event.waitUntil(savePage(url, res.clone()));
        return res;
      } catch {
        return offlinePage(url);
      }
    })());
  }
});

/** Keep the most useful screens saved, so they open offline even if you haven't visited them lately. */
let lastWarm = 0;
async function warm(force) {
  if (!force && Date.now() - lastWarm < WARM_EVERY_MS) return { skipped: true };
  lastWarm = Date.now();
  let urls = CORE;
  try {
    const r = await fetch("/api/offline", { credentials: "include", cache: "no-store" });
    if (r.ok) urls = [...new Set([...CORE, ...(await r.json()).urls])];
    else if (r.status === 401) return { signedOut: true };
  } catch { return { offline: true }; }
  let saved = 0;
  for (const p of urls) {
    try {
      const u = new URL(p, self.location.origin);
      const res = await fetch(u.href, { credentials: "include", headers: { accept: "text/html" } });
      await savePage(u, res);
      // also store the code each page needs, so it can run offline
      const html = res.ok ? await res.text() : "";
      const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
      const ac = await caches.open(ASSETS);
      for (const a of new Set(assets)) if (!(await ac.match(a))) await ac.add(a).catch(() => {});
      saved++;
    } catch { /* keep going */ }
  }
  return { saved, total: urls.length };
}

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "warm") e.waitUntil(warm(!!e.data.force).then((r) => e.source && e.source.postMessage({ type: "warmed", ...r })));
  if (e.data && e.data.type === "forget") e.waitUntil(caches.delete(PAGES));
});

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "Job Agent", body: event.data && event.data.text() }; }
  const title = d.title || "Job Agent";
  if (typeof d.badge === "number" && self.navigator && "setAppBadge" in self.navigator) {
    (d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => {});
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || "",
      tag: d.tag,
      data: { url: d.url || "/activity", eventId: d.eventId },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      timestamp: d.ts ? Date.parse(d.ts) : Date.now(),
    }),
  );
  // a new notification usually means something changed: refresh the offline copy too
  lastWarm = 0;
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        if ("navigate" in c) return c.navigate(url);
        return;
      }
    }
    return self.clients.openWindow(url);
  })());
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    const sub = event.newSubscription || (await self.registration.pushManager.getSubscription());
    if (sub) await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub), credentials: "include" });
  })());
});
