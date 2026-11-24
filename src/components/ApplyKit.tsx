"use client";
import { useState } from "react";
import type { Answer } from "@/lib/answers";

function CopyRow({ a }: { a: Answer }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(a.answer); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {}
  };
  return (
    <li className="flex items-start gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted font-semibold">{a.question}</p>
        {a.answer ? <p className="text-sm break-words">{a.answer}</p> : null}
        {a.needsYou && <p className="text-xs mt-0.5" style={{ color: "var(--warn)" }}>⚠ {a.needsYou}</p>}
      </div>
      {a.answer && (
        <button type="button" onClick={copy} className="btn btn-ghost !py-1 !px-2.5 !text-xs shrink-0">{copied ? "Copied" : "Copy"}</button>
      )}
    </li>
  );
}

export function ApplyKit({ answers, facts, prompts, cvUrl, applyUrl }: {
  answers: Answer[]; facts: string[]; prompts: { question: string; guide: string }[]; cvUrl: string; applyUrl: string | null;
}) {
  const groups = [...new Set(answers.map((a) => a.group))];
  const todo = answers.filter((a) => a.needsYou);
  return (
    <section className="card p-4 space-y-4">
      <div>
        <h2 className="font-bold">Apply Kit</h2>
        <p className="text-sm text-muted">Everything for this application. The agent fills what it safely can; you do the personal parts.</p>
      </div>

      <ol className="text-sm space-y-1.5 rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
        <li><b>1.</b> <a href={cvUrl} target="_blank" className="text-accent font-semibold underline">Download your tailored CV (PDF)</a></li>
        <li><b>2.</b> {applyUrl ? <a href={applyUrl} target="_blank" rel="noopener noreferrer" className="text-accent font-semibold underline">Open the employer's application form ↗</a> : "Open the employer's application page"} (on your Mac, “Apply now” above does steps 1–3 for you)</li>
        <li><b>3.</b> Copy the answers below into the form.</li>
        <li><b>4.</b> Write your personal answers in “Your answers” above (they're filled in for you on your Mac), complete any CAPTCHA, then press Submit.</li>
        <li><b>5.</b> Come back and tap “Record submission” with the confirmation number.</li>
      </ol>

      {todo.length > 0 && (
        <div className="rounded-xl p-3 text-sm" style={{ border: "1px solid var(--warn)" }}>
          <p className="font-semibold mb-1">Needs you ({todo.length})</p>
          <ul className="space-y-0.5">{todo.map((t, i) => <li key={i}>• {t.question}: {t.needsYou}</li>)}</ul>
          <a href="/settings/details" className="text-accent font-semibold text-sm">Fill in Application details →</a>
        </div>
      )}


      {groups.map((g) => (
        <div key={g}>
          <h3 className="font-semibold">{g}</h3>
          <ul className="divide-y divide-line">{answers.filter((a) => a.group === g).map((a, i) => <CopyRow key={i} a={a} />)}</ul>
        </div>
      ))}
    </section>
  );
}
