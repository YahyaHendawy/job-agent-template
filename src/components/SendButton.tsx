"use client";
import { useFormStatus } from "react-dom";

/** Submit button that can't be tapped twice while sending. */
export function SendButton({ disabled, children, pendingText = "Sending…" }: { disabled?: boolean; children: React.ReactNode; pendingText?: string }) {
  const { pending } = useFormStatus();
  return <button className="btn btn-primary" disabled={disabled || pending}>{pending ? pendingText : children}</button>;
}
