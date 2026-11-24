"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", d: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/jobs", label: "Jobs", d: "M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm2 0h2V5h-2z" },
  { href: "/applications", label: "Applications", d: "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm6 1.5V9h4.5M8 13h8M8 17h6" },
  { href: "/emails", label: "Emails", d: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm0 1 8 6 8-6" },
  { href: "/activity", label: "Activity", d: "M3 12h4l3-8 4 16 3-8h4" },
  { href: "/settings", label: "Settings", d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" },
];

export function Nav({ approvals }: { approvals: number }) {
  const path = usePathname();
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <>
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col gap-1 border-r border-line glass p-4">
        <div className="px-2 pb-4 pt-1 text-lg font-extrabold tracking-tight"><span className="aura-text">Job Agent</span></div>
        {TABS.map((t) => (
          <Link key={t.href} href={t.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${active(t.href) ? "side-active" : "text-muted hover:bg-surface-2"}`}>
            <Icon d={t.d} />{t.label}
            {t.href === "/applications" && approvals > 0 && <span className="ml-auto chip" style={{ color: "var(--accent)" }}>{approvals}</span>}
          </Link>
        ))}
      </aside>
      <nav className="md:hidden pin-bottom z-40 border-t border-line glass safe-bottom">
        <div className="grid grid-cols-6">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={`relative flex flex-col items-center gap-0.5 pt-2 pb-1 text-[10.5px] font-semibold ${active(t.href) ? "tab-active" : "text-muted"}`}>
              <Icon d={t.d} />{t.label}
              {t.href === "/applications" && approvals > 0 && (
                <span className="absolute top-1 right-[22%] min-w-4 h-4 px-1 rounded-full bg-bad text-white text-[10px] grid place-items-center">{approvals}</span>
              )}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
