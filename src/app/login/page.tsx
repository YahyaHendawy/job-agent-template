import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { loginAction } from "../actions";
import { currentUser, ownerExists } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Login() {
  if (await currentUser()) redirect("/");
  if (!(await ownerExists())) redirect("/setup");
  return (
    <main className="min-h-dvh grid place-items-center p-5 safe-top">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-2xl font-bold">Job Agent</h1>
        <p className="text-sm text-muted mb-5">Sign in to control your recruitment agent.</p>
        <AuthForm action={loginAction} submit="Sign in" fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "username" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]} />
      </div>
    </main>
  );
}
