import type { Metadata } from "next";
import { MapPinIcon, UserCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/surface";
import { EmptyState } from "@/components/ui/states";
import { DetailsForm } from "@/components/portal/details-form";
import { createClient } from "@/lib/supabase/server";
import { getMyClient, requireUser } from "@/lib/auth";
import { business } from "@/lib/site";
import { getBusiness } from "@/lib/business";

export const metadata: Metadata = { title: "Your details", robots: { index: false } };

export default async function PortalDetailsPage() {
  const contact = await getBusiness();

  const user = await requireUser("/portal/details");
  const client = await getMyClient();

  const supabase = await createClient();

  // Scoped by RLS to this person's own properties; there is no client filter to
  // forget here.
  const { data: properties } = client
    ? await supabase
        .from("properties")
        .select("id, label, address_line1, address_line2, city, postcode")
        .order("created_at", { ascending: true })
    : { data: null };

  return (
    <>
      <PageHeader
        title="Your details"
        description="What we have on file for you, and where to change it."
      />

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <Card>
          <h2 className="text-label uppercase text-ink-subtle">Contact details</h2>

          {client ? (
            <div className="mt-5">
              <DetailsForm client={client} />
            </div>
          ) : (
            <>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
                You are signed in as{" "}
                <span className="font-medium text-ink">{user.email}</span>, but we have not
                set up a customer record for you yet — that happens the first time we take
                a job on for you.
              </p>

              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
                Request a job and everything will appear here.
              </p>
            </>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Your addresses</h2>

            {(properties ?? []).length === 0 ? (
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
                No address on file yet. We add one when we take on a job at a property.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {(properties ?? []).map((property) => (
                  <li
                    key={property.id}
                    className="flex items-start gap-3 rounded-md bg-surface-sunken p-4"
                  >
                    <MapPinIcon
                      size={19}
                      weight="fill"
                      className="mt-0.5 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      {property.label ? (
                        <span className="block text-xs text-ink-subtle">{property.label}</span>
                      ) : null}
                      <span className="block text-[0.9375rem] text-ink">
                        {[
                          property.address_line1,
                          property.address_line2,
                          property.city,
                          property.postcode,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 text-sm leading-relaxed text-ink-muted">
              Addresses are tied to work already done, so we change those at our end —
              ring {contact.phone} and we will sort it.
            </p>
          </Card>

          <Card>
            <h2 className="text-label uppercase text-ink-subtle">Signing in</h2>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
              You sign in with a link sent to{" "}
              <span className="font-medium text-ink">{user.email}</span>. There is no
              password to remember or lose.
            </p>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
              Changing the email you sign in with is a different thing from the email we
              send invoices to. Ring us on {contact.phone} and we will move it across.
            </p>
          </Card>
        </div>
      </div>

      {!client ? (
        <div className="mt-8">
          <EmptyState
            icon={<UserCircleIcon size={28} weight="duotone" />}
            title="Nothing on file yet"
            description="Once we have taken on a job for you, your details, addresses, quotes and invoices all live here."
            action={{ label: "Request a job", href: "/request" }}
          />
        </div>
      ) : null}
    </>
  );
}
