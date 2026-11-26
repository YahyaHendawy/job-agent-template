"use client";
import { useActionState } from "react";
import { changePassword } from "@/app/actions";

/** Change your password (needs the current one); signs out every other device. */
export function ChangePassword() {
  const [state, action, pending] = useActionState(changePassword, null as null | { error?: string; ok?: string });
  return (
    <form action={action} className="space-y-2">
      <input name="current" type="password" autoComplete="current-password" required placeholder="Current password" className="input" />
      <input name="password" type="password" autoComplete="new-password" required minLength={12} placeholder="New password (12+ characters)" className="input" />
      <input name="confirm" type="password" autoComplete="new-password" required minLength={12} placeholder="New password again" className="input" />
      {state?.error && <p className="text-sm" style={{ color: "var(--bad)" }}>{state.error}</p>}
      {state?.ok && <p className="text-sm" style={{ color: "var(--good)" }}>✓ {state.ok}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Changing…" : "Change password"}</button>
    </form>
  );
}
