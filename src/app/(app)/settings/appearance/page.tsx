import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getAppearance } from "@/lib/appearance";
import { AppearanceForm } from "@/components/AppearanceForm";

export const dynamic = "force-dynamic";

export default async function AppearancePage() {
  return (
    <div>
      <Link href="/settings" className="text-sm text-accent font-semibold">← Settings</Link>
      <PageHeader title="Appearance" subtitle="Make the app look and work the way you like. Changes preview instantly; Save keeps them on every device." />
      <AppearanceForm initial={await getAppearance()} />
    </div>
  );
}
