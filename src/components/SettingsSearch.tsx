"use client";
import { useState, useEffect } from "react";

/** Instant filter for Settings: hides cards whose text doesn't match. */
export function SettingsSearch() {
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = q.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>("[data-settings-item]").forEach((el) => {
      el.style.display = !t || (el.textContent ?? "").toLowerCase().includes(t) ? "" : "none";
    });
  }, [q]);
  return (
    <div className="relative mb-3">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings (e.g. inbox, notifications, Reed)…" className="input !pl-9 !py-2" autoComplete="off" />
    </div>
  );
}
