import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { SettingsForm } from "@/components/owner/settings-form";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage() {
  await requireOwner();
  const supabase = await createClient();

  const { data: settings } = await supabase.from("settings").select("*").maybeSingle();

  // The settings row is a singleton created by the seed migration. Its absence
  // means the database was never migrated, which is a setup problem, not a
  // state the owner should be asked to fix through a form.
  if (!settings) notFound();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your business details, how you get paid, and the tax rules that apply to you."
        back={{ href: "/app", label: "Today" }}
      />

      <div className="mx-auto max-w-3xl">
        <SettingsForm settings={settings} />
      </div>
    </>
  );
}
