import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadPersona } from "@/lib/persona";
import { vapidKeys } from "@/lib/keys";
import { CompareBar } from "@/components/Compare";
import { pool } from "@/db";
import { Nav } from "@/components/Nav";
import { AppSync } from "@/components/AppSync";
import { OfflineSync } from "@/components/OfflineSync";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  if (!(await loadPersona(true)).completed) redirect("/welcome"); // new copy: ask the set-up questions first
  const r = await pool.query(`select count(*)::int n from applications where status = 'awaiting_approval'`);
  return (
    <div className="md:pl-60">
      <Nav approvals={r.rows[0].n} />
      <AppSync vapidKey={vapidKeys()?.publicKey ?? null} />
      <OfflineSync />
      <CompareBar />
      <main className="mx-auto max-w-4xl px-4 pt-5 pb-28 md:pb-10 safe-top">{children}</main>
    </div>
  );
}
