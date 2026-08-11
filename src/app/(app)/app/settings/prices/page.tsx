import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { PriceListManager } from "@/components/owner/price-list-manager";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "Price list", robots: { index: false } };

export default async function PriceListPage() {
  await requireOwner();
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("price_items")
    .select("*")
    // Most-used first within each type, so the rates actually reached for rise
    // to the top on their own rather than needing manual ordering.
    .order("times_used", { ascending: false })
    .order("description", { ascending: true });

  return (
    <>
      <PageHeader
        title="Price list"
        description="The rates you charge. These become one-tap lines when you build a quote or an invoice."
        back={{ href: "/app/settings", label: "Settings" }}
      />

      <div className="mx-auto max-w-3xl">
        <PriceListManager items={items ?? []} />
      </div>
    </>
  );
}
