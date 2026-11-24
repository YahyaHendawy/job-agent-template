import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { setupAction } from "../actions";
import { ownerExists } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Setup() {
  if (await ownerExists()) redirect("/login");
  return (
    <main className="min-h-dvh grid place-items-center p-5 safe-top">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-2xl font-bold">Claim your Job Agent</h1>
        <p className="text-sm text-muted mb-5">One time only. Use the setup passphrase you made up when you tapped Deploy. Then choose the email and password you&apos;ll sign in with (save them in your Passwords app).</p>
        <AuthForm action={setupAction} submit="Create account" fields={[
          { name: "token", label: "Setup passphrase (from when you deployed)", type: "password", autoComplete: "off" },
          { name: "name", label: "Your name", autoComplete: "name" },
          { name: "email", label: "Email", type: "email", autoComplete: "username" },
          { name: "password", label: "Password (12+ characters)", type: "password", autoComplete: "new-password" },
        ]} />
      </div>
    </main>
  );
}
