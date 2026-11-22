import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { ReminderSettingsForm } from "@/components/owner/reminders";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "Reminders", robots: { index: false } };

export default async function ReminderSettingsPage() {
  await requireOwner();
  const supabase = await createClient();

  const { data: settings } = await supabase.from("settings").select("*").maybeSingle();
  if (!settings) notFound();

  return (
    <>
      <PageHeader
        title="Reminders"
        description="Which reminders go to customers automatically, and what the app nudges you about."
        back={{ href: "/app/settings", label: "Settings" }}
      />

      <div className="mx-auto max-w-3xl">
        <ReminderSettingsForm settings={settings} />
      </div>
    </>
  );
}
