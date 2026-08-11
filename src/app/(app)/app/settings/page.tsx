import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRightIcon, TagIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { SettingsForm } from "@/components/owner/settings-form";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { cn } from "@/lib/cn";

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
        {/*
          The price list lives on its own page rather than inside this form.
          It is a list that grows, edited item by item, while everything below
          is a single form saved in one go — putting them together would mean
          one Save button with two different meanings.
        */}
        <Link
          href="/app/settings/prices"
          className={cn(
            "group flex items-center gap-4 rounded-lg border border-line bg-surface-raised p-5",
            "shadow-subtle transition-[border-color,box-shadow,transform] duration-200",
            "[transition-timing-function:var(--ease-standard)]",
            "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
          )}
        >
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent"
          >
            <TagIcon size={22} weight="duotone" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink">Price list</span>
            <span className="mt-0.5 block text-sm leading-snug text-ink-muted">
              Add, change or remove the rates that appear when you build a quote or an
              invoice.
            </span>
          </span>

          <ArrowRightIcon
            size={18}
            weight="bold"
            aria-hidden="true"
            className="shrink-0 text-ink-subtle transition-transform duration-300 group-hover:translate-x-1 group-hover:text-accent"
          />
        </Link>

        <div className="mt-6">
          <SettingsForm settings={settings} />
        </div>
      </div>
    </>
  );
}
