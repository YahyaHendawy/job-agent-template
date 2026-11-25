"use client";
import { useState } from "react";

/** A ready-to-use text with a Copy button (for templates you paste elsewhere). */
export function CopyBox({ text, rows = 8, label = "Copy" }: { text: string; rows?: number; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-1.5">
      <textarea readOnly rows={rows} value={text} className="input font-sans" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn btn-ghost !text-xs" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch {} }}>
        {done ? "✓ Copied" : `📋 ${label}`}
      </button>
    </div>
  );
}
