import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/surface";
import { JobEditForm } from "@/components/owner/job-edit-form";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit job", robots: { index: false } };

/** Correcting a job's title, description, address, type and urgency. */
export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await requireOwner();
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("id, reference, title, description, urgency, service_id, property_id, client_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!job) notFound();

  const [{ data: services }, { data: addresses }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("properties")
      .select("id, label, address_line1, postcode")
      .eq("client_id", job.client_id)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Edit the job"
        description={`${job.reference} · ${job.title}`}
        back={{ href: `/app/jobs/${job.id}`, label: "Back to the job" }}
      />

      <div className="mx-auto max-w-2xl">
        <Card>
          <JobEditForm job={job} services={services ?? []} addresses={addresses ?? []} />
        </Card>
      </div>
    </>
  );
}
