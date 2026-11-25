"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Dest = { label: string; href: string; group: string; keywords?: string };

/** Every place in the app, so any screen is one tap (or a few letters) away. */
const DESTS: Dest[] = [
  { group: "Main", label: "🏠 Home", href: "/" },
  { group: "Main", label: "🧭 Tour of the app", href: "/tour", keywords: "tutorial help guide new start" },
  { group: "Main", label: "💼 Jobs", href: "/jobs" },
  { group: "Main", label: "🗺️ Map of all jobs", href: "/map", keywords: "where location places pins" },
  { group: "Main", label: "📄 Applications", href: "/applications" },
  { group: "Main", label: "✋ Solo (things only you can do)", href: "/todo", keywords: "to do todo checklist my part" },
  { group: "Main", label: "💼 My job (offers, starting, hours)", href: "/work", keywords: "offer accept decline contract start hours journal reference work placement" },
  { group: "Main", label: "🎯 Manager (career plan)", href: "/manager", keywords: "career coach orders skills season scorecard goat" },
  { group: "Main", label: "📧 Emails", href: "/emails" },
  { group: "Main", label: "📊 Analytics (pie charts, weak points)", href: "/analytics", keywords: "stats statistics charts pie weak points cv assessments stages" },
  { group: "Main", label: "📈 Activity log", href: "/activity" },
  { group: "Main", label: "⚙️ Settings", href: "/settings" },
  { group: "Main", label: "🔎 Search everything", href: "/search" },
  { group: "Main", label: "⇄ Compare", href: "/compare" },

  { group: "Applications", label: "🤔 To decide", href: "/applications?tab=approval" },
  { group: "Applications", label: "✅ Going ahead", href: "/applications?tab=going" },
  { group: "Applications", label: "📨 Submitted", href: "/applications?tab=submitted" },
  { group: "Applications", label: "🎤 Tests & interviews", href: "/applications?tab=progress" },
  { group: "Applications", label: "🎉 Offers", href: "/applications?tab=offers" },
  { group: "Applications", label: "👎 Not doing", href: "/applications?tab=notdoing" },
  { group: "Applications", label: "💪 Rejected", href: "/applications?tab=closed" },
  { group: "Applications", label: "⏳ Being prepared", href: "/applications?tab=drafts" },

  { group: "Jobs", label: "⭐ Best matches", href: "/jobs?sort=score" },
  { group: "Jobs", label: "🆕 Newest found", href: "/jobs?sort=new" },
  { group: "Jobs", label: "⏰ Closing within 7 days", href: "/jobs?closing=7&sort=deadline" },
  { group: "Jobs", label: "★ Starred", href: "/jobs?starred=1" },
  { group: "Jobs", label: "➕ Add a job by link", href: "/jobs/new" },

  { group: "Solo", label: "📨 Send these applications", href: "/todo#send" },
  { group: "Solo", label: "📧 Emails waiting for you", href: "/todo#emails" },
  { group: "Solo", label: "🎤 Tests, interviews and offers", href: "/todo#stages" },
  { group: "Solo", label: "⏳ No reply after 2 weeks", href: "/todo#chase" },
  { group: "Solo", label: "🌐 Weekly job-site check", href: "/todo#sites", keywords: "linkedin indeed gradcracker" },
  { group: "Solo", label: "➕ Log an application made elsewhere", href: "/todo#own", keywords: "linkedin easy apply fair" },
  { group: "Solo", label: "🧰 Accounts and alerts to set up", href: "/todo#setup" },
  { group: "Solo", label: "🚧 What I can't do", href: "/limits" },

  { group: "Manager", label: "🎯 This week's orders", href: "/manager#orders" },
  { group: "Manager", label: "📆 Hiring season", href: "/manager#season" },
  { group: "Manager", label: "📊 Scorecard", href: "/manager#scorecard" },
  { group: "Manager", label: "🧠 Skills employers want", href: "/manager#skills", keywords: "courses learn gap" },
  { group: "Manager", label: "🛠️ Monthly career moves", href: "/manager#moves" },

  { group: "Emails", label: "❗ Emails that need you", href: "/emails?status=todo" },
  { group: "Emails", label: "🎤 Interview emails", href: "/emails?category=interview" },
  { group: "Emails", label: "📝 Online tests", href: "/emails?category=assessment" },

  { group: "Settings", label: "🎨 Appearance (theme, colours, tabs, Home)", href: "/settings/appearance", keywords: "theme colour color font dark light customise customize" },
  { group: "Settings", label: "🪪 Application details (address, visa, dates)", href: "/settings/details" },
  { group: "Settings", label: "📬 Job inbox", href: "/settings/email" },
  { group: "Settings", label: "🧩 Safari autofill", href: "/settings/autofill" },
  { group: "Settings", label: "🔌 Job sources", href: "/settings#sources" },
  { group: "Settings", label: "🆓 Free plan", href: "/settings#free-plan" },
  { group: "Settings", label: "☪️ Halal filter", href: "/settings#halal" },
  { group: "Settings", label: "🔔 Notifications", href: "/settings", keywords: "push alerts" },
];

type Target = { id: string; label: string };

/**
 * Pinned under the status bar on every screen:
 *  • ☰ Jump opens a searchable menu of every page, tab and section in the app;
 *  • chips for the current page's own sections (found from its headings), highlighting where you are.
 */
export function JumpBar() {
  const path = usePathname();
  const search = useSearchParams();
  const [targets, setTargets] = useState<Target[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rail = useRef<HTMLDivElement>(null);

  // Find this page's sections from its card headings (no tagging needed, so new pages get chips by themselves).
  const scan = useCallback(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const seen = new Set<string>();
    const found: Target[] = [];
    main.querySelectorAll<HTMLElement>("h2, [data-jump]").forEach((h) => {
      if (h.closest("[data-jumpbar]") || h.closest("[hidden]")) return;
      const box = (h.hasAttribute("data-jump") ? h : h.closest<HTMLElement>("section, details, .card")) ?? h;
      if (box === main || seen.has(box.id)) return;
      let label = (h.getAttribute("data-jump") || box.getAttribute("data-jump") || h.innerText || "").replace(/\s+/g, " ").trim();
      label = label.replace(/\s*\(?\d+\)?$/, "").replace(/^\d+\s*/, "");
      if (!label) return;
      if (label.length > 26) label = label.slice(0, 24).trimEnd() + "…";
      if (!box.id) box.id = "j-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
      box.setAttribute("data-jump-target", "");
      seen.add(box.id);
      found.push({ id: box.id, label: label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() });
    });
    setTargets((old) => (JSON.stringify(old) === JSON.stringify(found) ? old : found));
  }, []);

  useEffect(() => {
    setOpen(false);
    scan();
    const t = [setTimeout(scan, 150), setTimeout(scan, 800)];
    const main = document.querySelector("main");
    let deb: ReturnType<typeof setTimeout> | undefined;
    const mo = new MutationObserver(() => { clearTimeout(deb); deb = setTimeout(scan, 200); });
    if (main) mo.observe(main, { childList: true, subtree: true });
    return () => { t.forEach(clearTimeout); clearTimeout(deb); mo.disconnect(); };
  }, [path, search, scan]);

  // Which section is on screen
  useEffect(() => {
    if (targets.length < 2) return;
    const onScroll = () => {
      const line = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--jump-offset")) || 110);
      let cur: string | null = null;
      for (const t of targets) {
        const el = document.getElementById(t.id);
        if (el && el.getBoundingClientRect().top <= line) cur = t.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = targets[targets.length - 1].id;
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [targets]);

  // Keep the highlighted chip visible in the rail
  useEffect(() => {
    if (!active || !rail.current) return;
    const chip = rail.current.querySelector<HTMLElement>(`[data-for="${active}"]`);
    if (chip) rail.current.scrollTo({ left: chip.offsetLeft - rail.current.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [active]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.documentElement.style.overflow = ""; };
  }, [open]);

  // ⌘K / Ctrl+K opens the menu on the Mac
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); setQ(""); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "DETAILS") (el as HTMLDetailsElement).open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const here: Dest[] = targets.map((t) => ({ group: "On this page", label: `↓ ${t.label}`, href: `#${t.id}` }));
    const all = [...here, ...DESTS];
    if (!s) return all;
    return all.filter((d) => `${d.label} ${d.group} ${d.keywords ?? ""}`.toLowerCase().includes(s));
  }, [q, targets]);
  const groups = [...new Set(list.map((d) => d.group))];

  return (
    <>
      <div data-jumpbar className="jumpbar -mx-4 px-4 mb-3 flex items-center gap-2">
        <button type="button" onClick={() => { setOpen(true); setQ(""); }} className="chip !py-1.5 shrink-0 font-semibold" aria-haspopup="dialog" aria-label="Jump anywhere">
          ☰ Jump
        </button>
        {targets.length >= 2 && (
          <div ref={rail} className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1 py-0.5" role="navigation" aria-label="Sections on this page">
            {targets.map((t) => (
              <button key={t.id} type="button" data-for={t.id} onClick={() => go(t.id)}
                className={`chip !py-1.5 shrink-0 whitespace-nowrap ${active === t.id ? "jump-on" : ""}`} aria-current={active === t.id ? "location" : undefined}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        {targets.length < 2 && <span className="hud-label truncate">Tap to go anywhere</span>}
      </div>

      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col" role="dialog" aria-modal aria-label="Jump anywhere">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="relative mx-auto w-full max-w-xl mt-[calc(env(safe-area-inset-top)+0.75rem)] px-3 flex flex-col min-h-0 max-h-[calc(100dvh-env(safe-area-inset-top)-6.5rem)]">
            <div className="card p-3 flex flex-col min-h-0" style={{ background: "var(--surface)" }}>
              <div className="flex gap-2 mb-2">
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to… (e.g. interviews, inbox, LinkedIn)"
                  className="input !py-2" enterKeyHint="go"
                  onKeyDown={(e) => { if (e.key === "Enter" && list[0]) { const d = list[0]; if (d.href.startsWith("#")) { setOpen(false); go(d.href.slice(1)); } else { (document.getElementById("jump-first") as HTMLAnchorElement | null)?.click(); } } }} />
                <button type="button" className="btn btn-ghost !py-2" onClick={() => setOpen(false)}>Close</button>
              </div>
              <div className="overflow-y-auto min-h-0 -mx-1 px-1">
                {groups.map((g) => (
                  <div key={g} className="mb-2">
                    <p className="hud-label px-1 py-1">{g}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {list.filter((d) => d.group === g).map((d) => {
                        const first = d === list[0];
                        return d.href.startsWith("#") ? (
                          <button key={d.href} type="button" onClick={() => { setOpen(false); go(d.href.slice(1)); }}
                            className="text-left rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2" style={{ background: "var(--surface-2)" }}>{d.label}</button>
                        ) : (
                          <Link key={d.href} id={first ? "jump-first" : undefined} href={d.href} onClick={() => setOpen(false)}
                            className="rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2" style={{ background: "var(--surface-2)" }}>{d.label}</Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {list.length === 0 && <p className="text-sm text-muted p-2">Nothing called “{q}”. <Link href={`/search?q=${encodeURIComponent(q)}`} onClick={() => setOpen(false)} className="text-accent font-semibold">Search jobs, emails and activity for it →</Link></p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
