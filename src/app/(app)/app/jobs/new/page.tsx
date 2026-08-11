import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { PhoneJobForm } from "@/components/owner/phone-job-form";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "New job", robots: { index: false } };

export default async function NewJobPage() {
  await requireOwner();
  const supabase = await createClient();

  const [{ data: clients }, { data: services }] = await Promise.all([
    // Ordered by name because the owner is scanning for a person they are
    // speaking to, not browsing recent activity.
    supabase
      .from("clients")
      .select("id, full_name, phone")
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),

    supabase
      .from("services")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Job from a call"
        description="Take it down while they are on the phone. Only the name, a way to reach them and a line about the problem are needed — everything else can follow."
        back={{ href: "/app/jobs", label: "All jobs" }}
      />

      <div className="mx-auto max-w-3xl">
        <PhoneJobForm clients={clients ?? []} services={services ?? []} />
      </div>
    </>
  );
}
