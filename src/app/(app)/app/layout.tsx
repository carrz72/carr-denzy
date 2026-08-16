import {
  BriefcaseIcon,
  CalendarBlankIcon,
  GaugeIcon,
  ReceiptIcon,
  TrayIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AppShell } from "@/components/app-shell";
import { AppBadge } from "@/components/app-badge";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { countUnreadMessages } from "@/lib/unread";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const supabase = await createClient();

  /*
   * Counts on the navigation, because the alternative is remembering to go
   * and look.
   *
   * Every badge here answers "something needs you, and this is where it is".
   * That rule is what keeps them worth glancing at: a badge showing how many
   * jobs exist, or how many invoices were ever raised, is a number that is
   * always there, and a number that is always there is one nobody sees after
   * the first week. Each of these can reach zero, and each of them means work.
   *
   * Three cheap `head: true` counts in parallel — no rows come back, only the
   * number — because this runs on every page in the app.
   */
  const today = new Date().toISOString().slice(0, 10);

  const [{ count: newEnquiries }, unreadMessages, { count: overdueInvoices }] = await Promise.all([
    supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("status", "new"),

    countUnreadMessages(supabase, user.id),

    // Money somebody owes and has not paid on time. The one number in this app
    // that directly costs the business if nobody looks at it.
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .in("status", ["sent", "part_paid", "overdue"])
      .is("deleted_at", null)
      .lt("due_date", today),
  ]);

  // What the home-screen icon shows: everything waiting, in one number. The
  // navigation says where it is; this only has to say that there is something.
  const waiting = (newEnquiries ?? 0) + unreadMessages + (overdueInvoices ?? 0);

  return (
    <AppShell
      brandHref="/app"
      brandLabel="Your business"
      userLabel={user.fullName ?? user.email}
      /*
       * Five, because the mobile bar is five thumb targets wide and a sixth
       * makes every one of them too narrow to hit in a van.
       *
       * Customers came off it and moved to a button on Today: it is browsed
       * occasionally, whereas the Diary is the screen this business needs
       * several times a day — it is the thing replacing the paper book.
       */
      items={[
        { href: "/app", label: "Today", icon: <GaugeIcon size={21} /> },
        {
          href: "/app/enquiries",
          label: "Enquiries",
          icon: <TrayIcon size={21} />,
          badge: newEnquiries ?? 0,
        },
        { href: "/app/diary", label: "Diary", icon: <CalendarBlankIcon size={21} /> },
        {
          href: "/app/jobs",
          label: "Jobs",
          icon: <BriefcaseIcon size={21} />,
          // Customers reply on the job thread, so an unanswered message lives
          // under Jobs — which is where this badge sends you to find it.
          badge: unreadMessages,
        },
        {
          href: "/app/invoices",
          label: "Money",
          icon: <ReceiptIcon size={21} />,
          badge: overdueInvoices ?? 0,
        },
      ]}
    >
      <AppBadge count={waiting} />
      <div className="container-page py-8 md:py-10">{children}</div>
    </AppShell>
  );
}
