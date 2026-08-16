import Link from "next/link";
import {
  ArrowRightIcon,
  FileTextIcon,
  HouseIcon,
  ReceiptIcon,
  UserCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AppShell } from "@/components/app-shell";
import { AppBadge } from "@/components/app-badge";
import { buttonClasses } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { countUnreadMessages } from "@/lib/unread";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // The middleware already redirected anonymous visitors. This is the second
  // gate: middleware is convenience, and a layout that trusts it alone is one
  // config change away from leaking.
  const user = await requireUser("/portal");
  const supabase = await createClient();

  /*
   * The customer's side had no indicators at all, which put the whole burden
   * of noticing on the email that announced it. Emails get buried, read on a
   * phone at a bus stop and forgotten, or filed by a spam rule — and then a
   * quote sits unanswered for a fortnight and everyone assumes the other
   * person is dealing with it.
   *
   * Same rule as the owner's side: a badge means "this is waiting for you",
   * never "here is how many you have". A count of past invoices would sit
   * there for ever and teach people to ignore the one that matters.
   *
   * Every query is scoped by RLS to this customer, so these are their own
   * quotes and their own invoices without a client id ever being passed in.
   */
  const [{ count: quotesToAnswer }, { count: invoicesToPay }, unreadMessages] = await Promise.all([
    // Sent, and not yet accepted or declined. This is the one that costs
    // somebody money if it goes unnoticed until the price has moved.
    supabase
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .is("deleted_at", null),

    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .in("status", ["sent", "part_paid", "overdue"])
      .is("deleted_at", null),

    countUnreadMessages(supabase, user.id),
  ]);

  // One number for the home-screen icon: a quote to answer, a bill to pay, or
  // a message waiting.
  const waiting = (quotesToAnswer ?? 0) + (invoicesToPay ?? 0) + unreadMessages;

  return (
    <AppShell
      brandHref="/portal"
      brandLabel="Your account"
      userLabel={user.fullName ?? user.email}
      items={[
        {
          href: "/portal",
          label: "Jobs",
          icon: <HouseIcon size={21} />,
          // Messages hang off a job, so this is where an unanswered one is.
          badge: unreadMessages,
        },
        {
          href: "/portal/quotes",
          label: "Quotes",
          icon: <FileTextIcon size={21} />,
          badge: quotesToAnswer ?? 0,
        },
        {
          href: "/portal/invoices",
          label: "Invoices",
          icon: <ReceiptIcon size={21} />,
          badge: invoicesToPay ?? 0,
        },
        // "Account" rather than "Details": the tab holds notification settings
        // too, and nobody looking for those would tap "Details".
        { href: "/portal/details", label: "Account", icon: <UserCircleIcon size={21} /> },
      ]}
    >
      {/*
        An owner can legitimately end up here — following an old link, or a
        magic link carrying `?next=/portal` — and the portal navigation has no
        route back to the business app. Rather than redirect (which would stop
        them ever previewing what a customer sees), give them the way out.
      */}
      {user.role === "owner" || user.role === "staff" ? (
        <div className="border-b border-accent-line bg-accent-soft">
          <div className="container-page flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="text-[0.9375rem] text-accent-ink">
              You are signed in as the {user.role}. This is the customer&apos;s view.
            </p>

            <Link
              href="/app"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Go to your business app
              <ArrowRightIcon size={15} weight="bold" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : null}

      <AppBadge count={waiting} />
      <div className="container-page py-8 md:py-12">{children}</div>
    </AppShell>
  );
}
