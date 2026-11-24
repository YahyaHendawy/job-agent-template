"use client";
import { useActionState } from "react";

type Field = { name: string; label: string; type?: string; autoComplete?: string };

export function AuthForm({ action, fields, submit }: {
  action: (s: unknown, f: FormData) => Promise<{ error?: string } | undefined>;
  fields: Field[];
  submit: string;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="space-y-3">
      {fields.map((f) => (
        <label key={f.name} className="block">
          <span className="text-sm font-semibold text-muted">{f.label}</span>
          <input className="input mt-1" name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} required />
        </label>
      ))}
      {state?.error && <p className="text-sm" style={{ color: "var(--bad)" }}>{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Please wait…" : submit}</button>
    </form>
  );
}
