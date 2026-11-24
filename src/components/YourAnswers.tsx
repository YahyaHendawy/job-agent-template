"use client";
import { useEffect, useState, useTransition } from "react";
import { saveWrittenAnswer } from "@/app/actions";
import { queueAnswer, pendingFor, flushOutbox } from "@/lib/outbox";

type Q = { key: string; question: string; guide?: string; source: "standard" | "form"; answer: string; suggestions: { question: string; answer: string }[] };

function AnswerBox({ appId, q }: { appId: string; q: Q }) {
  const [text, setText] = useState(q.answer);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "device">(q.answer ? "saved" : "idle");
  const [, start] = useTransition();
  // An answer typed offline is newer than the saved page: show it, and mark it as waiting to send.
  useEffect(() => {
    const sync = () => { const p = pendingFor(appId, q.key); if (p) { setText(p.answer); setSaved("device"); } else setSaved((s) => (s === "device" ? "saved" : s)); };
    sync(); addEventListener("ja-outbox", sync); return () => removeEventListener("ja-outbox", sync);
  }, [appId, q.key]);
  const keepOnDevice = (v: string) => { queueAnswer({ appId, key: q.key, question: q.question, answer: v }); setSaved("device"); };
  const save = (v: string) => {
    if (!navigator.onLine) return keepOnDevice(v);
    setSaved("saving");
    start(async () => {
      try { await saveWrittenAnswer(appId, q.key, q.question, v); setSaved("saved"); }
      catch { keepOnDevice(v); flushOutbox(); }
    });
  };
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <p className="font-semibold text-sm flex-1">{q.question}</p>
        {q.source === "form" && <span className="chip shrink-0" style={{ color: "var(--warn)" }}>On the form</span>}
      </div>
      {q.guide && <p className="text-xs text-muted">{q.guide}</p>}
      <textarea value={text} onChange={(e) => { setText(e.target.value); setSaved("idle"); }} onBlur={() => text !== q.answer && save(text)}
        rows={5} className="input !text-[15px] leading-relaxed" placeholder="Write in your own words…" />
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>{words} words</span>
        <span className="ml-auto">{saved === "saving" ? "Saving…" : saved === "device" ? "📱 Kept on this device. It sends by itself when you're online" : saved === "saved" ? "✓ Saved. The Safari autofill will use this" : text ? "Tap outside the box to save" : ""}</span>
      </div>
      {!text && q.suggestions.length > 0 && (
        <div className="rounded-xl p-2.5 text-xs space-y-2" style={{ background: "var(--surface-2)" }}>
          <p className="font-semibold">Reuse something you wrote before:</p>
          {q.suggestions.map((s, i) => (
            <div key={i} className="flex gap-2 items-start">
              <p className="flex-1 text-muted line-clamp-3">{s.answer}</p>
              <button type="button" className="btn btn-ghost !py-1 !px-2 !text-xs shrink-0" onClick={() => { setText(s.answer); save(s.answer); }}>Use</button>
            </div>
          ))}
          <p className="text-muted">Edit it to fit this employer after inserting.</p>
        </div>
      )}
    </div>
  );
}

export function YourAnswers({ appId, questions, facts }: { appId: string; questions: Q[]; facts: string[] }) {
  return (
    <section id="answers" className="card p-4 space-y-5 scroll-mt-4">
      <div>
        <h2 className="font-bold">Your answers</h2>
        <p className="text-sm text-muted">Written by you, so they're never AI-generated. Saved answers are filled into the form automatically on your Mac.</p>
      </div>
      {questions.map((q) => <AnswerBox key={q.key} appId={appId} q={q} />)}
      <details className="text-sm">
        <summary className="font-semibold cursor-pointer">Facts from your CV to use</summary>
        <ul className="mt-2 space-y-1 text-muted">{facts.map((f, i) => <li key={i}>• {f}</li>)}</ul>
      </details>
    </section>
  );
}
