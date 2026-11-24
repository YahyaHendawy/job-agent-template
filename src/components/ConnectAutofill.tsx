"use client";
import { useEffect, useState } from "react";

export function ConnectAutofill() {
  const [present, setPresent] = useState<boolean | null>(null);
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      if (e.data?.type === "JOB_AGENT_EXTENSION_PRESENT") setPresent(true);
      if (e.data?.type === "JOB_AGENT_CONNECTED") setState("done");
      if (e.data?.type === "JOB_AGENT_CONNECT_FAILED") setState("failed");
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ type: "JOB_AGENT_PING" }, location.origin);
    const t = setTimeout(() => setPresent((p) => p ?? false), 1500);
    return () => { window.removeEventListener("message", onMsg); clearTimeout(t); };
  }, []);

  async function connect() {
    setState("working");
    const r = await fetch("/api/autofill/connect", { method: "POST" });
    if (!r.ok) return setState("failed");
    const { token } = await r.json();
    window.postMessage({ type: "JOB_AGENT_TOKEN", token }, location.origin); // only the extension's bridge on this page receives it
    setTimeout(() => setState((s) => (s === "working" ? "failed" : s)), 4000);
  }

  if (present === null) return <p className="text-sm text-muted">Looking for the Safari extension…</p>;
  if (!present)
    return (
      <div className="text-sm space-y-2">
        <p style={{ color: "var(--warn)" }}>The Job Agent extension isn't enabled in this browser.</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Open the <b>Job Agent</b> Mac app once (it installs the extension).</li>
          <li>Safari → Settings → <b>Extensions</b> → tick <b>Job Agent Autofill</b>.</li>
          <li>Click its icon in the toolbar → <b>Always Allow on Every Website</b> (or allow on job sites).</li>
          <li>Reload this page and tap <b>Connect this Mac</b>.</li>
        </ol>
      </div>
    );
  return (
    <div className="text-sm space-y-2">
      <p style={{ color: "var(--good)" }}>✓ Extension detected in this browser.</p>
      {state === "done" ? (
        <p className="font-semibold" style={{ color: "var(--good)" }}>Connected. Open any application form and use “Fill with Job Agent”.</p>
      ) : (
        <button className="btn btn-primary" disabled={state === "working"} onClick={connect}>{state === "working" ? "Connecting…" : "Connect this Mac"}</button>
      )}
      {state === "failed" && <p style={{ color: "var(--bad)" }}>Couldn't connect. Reload the page and try again.</p>}
    </div>
  );
}
