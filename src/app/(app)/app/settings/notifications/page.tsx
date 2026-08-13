import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { NotificationEmailsForm } from "@/components/owner/notification-emails-form";
import { PushToggle } from "@/components/owner/push-toggle";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default async function NotificationsSettingsPage() {
  await requireOwner();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("settings")
    .select("notification_emails")
    .maybeSingle();

  if (!settings) notFound();

  return (
    <>
      <PageHeader
        title="Notifications"
        description="How you find out a job request has come in."
        back={{ href: "/app/settings", label: "Settings" }}
      />

      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {/*
          Push first. It is the one that actually reaches somebody on a job,
          and it is the one nobody knows exists unless it is put in front of
          them — email is the thing people already assume is happening.
        */}
        <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />

        <NotificationEmailsForm
          emails={settings.notification_emails ?? []}
          fallbackEmail={process.env.OWNER_NOTIFICATION_EMAIL ?? null}
        />
      </div>
    </>
  );
}
