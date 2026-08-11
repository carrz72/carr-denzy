import Link from "next/link";
import type { Metadata } from "next";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { buttonClasses } from "@/components/ui/button";
import { PortfolioManager } from "@/components/owner/portfolio-manager";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "Our work", robots: { index: false } };

export default async function OwnerPortfolioPage() {
  await requireOwner();
  const supabase = await createClient();

  // Unpublished rows included: this is the management view, and a hidden photo
  // the owner cannot see is a photo they cannot bring back.
  const { data: items } = await supabase
    .from("portfolio_items")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <>
      <PageHeader
        title="Our work"
        description="The photographs on your website. The order here is the order customers see."
        back={{ href: "/app", label: "Today" }}
        action={
          <Link
            href="/work"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            View the page
            <ArrowSquareOutIcon size={16} aria-hidden="true" />
          </Link>
        }
      />

      <div className="mx-auto max-w-3xl">
        <PortfolioManager items={items ?? []} />
      </div>
    </>
  );
}
