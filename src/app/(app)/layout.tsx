import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadPersona } from "@/lib/persona";
import { vapidKeys } from "@/lib/keys";
import { CompareBar } from "@/components/Compare";
import { pool } from "@/db";
import { Nav } from "@/components/Nav";
import { JumpBar } from "@/components/JumpBar";
import { getAppearance } from "@/lib/appearance";
import { Suspense } from "react";
import { AppSync } from "@/components/AppSync";
import { OfflineSync } from "@/components/OfflineSync";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  if (!(await loadPersona(true)).completed) redirect("/welcome"); // new copy: ask the set-up questions first
  const look = await getAppearance();
  const r = await pool.query(`select (select count(*)::int from applications where status = 'awaiting_approval') n,
      (select count(*)::int from applications where status in ('approved','assessment','interview','offer'))
      + (select count(*)::int from emails where needs_action and handled_at is null) todo`);
  return (
    <div className="md:pl-60">
      <Nav approvals={look.badges ? r.rows[0].n : 0} todo={look.badges ? r.rows[0].todo : 0} tabs={look.tabs} labels={look.tabLabels} />
      <AppSync vapidKey={vapidKeys()?.publicKey ?? null} />
      <OfflineSync />
      <CompareBar />
      <main className="mx-auto max-w-4xl px-4 pb-28 md:pb-10 safe-top">{look.jumpBar && <Suspense fallback={null}><JumpBar /></Suspense>}{children}</main>
    </div>
  );
}
