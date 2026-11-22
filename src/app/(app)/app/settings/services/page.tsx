import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { ServicesManager } from "@/components/owner/services-manager";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import type { Service } from "@/types/database";

export const metadata: Metadata = { title: "Services", robots: { index: false } };

export default async function ServicesSettingsPage() {
  await requireOwner();
  const supabase = await createClient();

  // Hidden services included: this is where they are brought back.
  const { data } = await supabase
    .from("services")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return (
    <>
      <PageHeader
        title="Services"
        description="What the website says you do: names, descriptions, example jobs, guide prices and photos."
        back={{ href: "/app/settings", label: "Settings" }}
      />
      <div className="mx-auto max-w-3xl">
        <ServicesManager services={(data ?? []) as Service[]} />
      </div>
    </>
  );
}
