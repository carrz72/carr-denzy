import Link from "next/link";
import {
  ArrowRightIcon,
  FileTextIcon,
  HouseIcon,
  ReceiptIcon,
  UserCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AppShell } from "@/components/app-shell";
import { buttonClasses } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // The middleware already redirected anonymous visitors. This is the second
  // gate: middleware is convenience, and a layout that trusts it alone is one
  // config change away from leaking.
  const user = await requireUser("/portal");

  return (
    <AppShell
      brandHref="/portal"
      brandLabel="Your account"
      userLabel={user.fullName ?? user.email}
      items={[
        { href: "/portal", label: "Jobs", icon: <HouseIcon size={21} /> },
        { href: "/portal/quotes", label: "Quotes", icon: <FileTextIcon size={21} /> },
        { href: "/portal/invoices", label: "Invoices", icon: <ReceiptIcon size={21} /> },
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

      <div className="container-page py-8 md:py-12">{children}</div>
    </AppShell>
  );
}
