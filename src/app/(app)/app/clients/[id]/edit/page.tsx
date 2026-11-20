import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/surface";
import {
  AddPropertyDisclosure,
  ClientDetailsEditForm,
  PropertyEditForm,
} from "@/components/owner/client-edit-forms";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit customer", robots: { index: false } };

/**
 * Correcting a customer's record: contact details, private notes, addresses.
 *
 * Changing an address here corrects it wherever it shows, past jobs included,
 * which is right for a typo. Someone who has moved gets a new address added
 * instead, so the old jobs keep the place the work was actually done. Sent
 * invoices are untouched either way: each carries its own copy.
 */
export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await requireOwner();
  const supabase = await createClient();

  const [{ data: client }, { data: properties }, { data: privateNotes }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, full_name, company_name, email, phone, profile_id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("properties")
      .select("id, label, address_line1, address_line2, city, postcode, access_notes")
      .eq("client_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("client_private_notes").select("notes").eq("client_id", id).maybeSingle(),
  ]);

  if (!client) notFound();

  return (
    <>
      <PageHeader
        title="Edit customer"
        description={client.full_name}
        back={{ href: `/app/clients/${client.id}`, label: "Back to the customer" }}
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Card>
          <h2 className="text-label uppercase text-ink-subtle">Their details</h2>
          <div className="mt-5">
            <ClientDetailsEditForm client={client} privateNotes={privateNotes?.notes ?? null} />
          </div>
        </Card>

        {(properties ?? []).map((property, index) => (
          <Card key={property.id}>
            <h2 className="text-label uppercase text-ink-subtle">
              {property.label || `Address ${index + 1}`}
            </h2>
            <p className="mt-1.5 text-sm text-ink-muted">
              For a typo or new access notes. If they have moved, add the new address below
              so past jobs keep the old one.
            </p>
            <div className="mt-5">
              <PropertyEditForm clientId={client.id} property={property} />
            </div>
          </Card>
        ))}

        {(properties ?? []).length === 0 ? (
          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Address</h2>
            <p className="mt-1.5 text-sm text-ink-muted">None on file yet.</p>
            <div className="mt-5">
              <PropertyEditForm clientId={client.id} />
            </div>
          </Card>
        ) : (
          <AddPropertyDisclosure clientId={client.id} />
        )}
      </div>
    </>
  );
}
