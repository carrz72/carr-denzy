import {
  BriefcaseIcon,
  CalendarBlankIcon,
  GaugeIcon,
  ReceiptIcon,
  TrayIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AppShell } from "@/components/app-shell";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const supabase = await createClient();

  // The unread count sits on the navigation, because an enquiry nobody looks
  // at is a job that went to whoever answered their phone first.
  const { count: newEnquiries } = await supabase
    .from("enquiries")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

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
        { href: "/app/jobs", label: "Jobs", icon: <BriefcaseIcon size={21} /> },
        { href: "/app/invoices", label: "Money", icon: <ReceiptIcon size={21} /> },
      ]}
    >
      <div className="container-page py-8 md:py-10">{children}</div>
    </AppShell>
  );
}
