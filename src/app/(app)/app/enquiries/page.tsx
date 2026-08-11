import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, TrayIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app-shell";
import { Badge, UrgencyBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Enquiries", robots: { index: false } };

const urgencyRank = { emergency: 0, soon: 1, flexible: 2 } as const;

export default async function EnquiriesPage() {
  const supabase = await createClient();

  const { data: enquiries } = await supabase
    .from("enquiries")
    .select(
      "id, reference, full_name, email, phone, description, urgency, status, postcode, service_label, created_at",
    )
    .order("created_at", { ascending: false });

  const all = enquiries ?? [];

  // Emergencies first, then oldest within each band — an emergency that came
  // in two hours ago outranks a flexible one from ten minutes ago
  // (spec FR-28).
  const open = all
    .filter((enquiry) => enquiry.status === "new" || enquiry.status === "read")
    .sort((a, b) => {
      const byUrgency = urgencyRank[a.urgency] - urgencyRank[b.urgency];
      if (byUrgency !== 0) return byUrgency;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  const closed = all.filter(
    (enquiry) => enquiry.status === "converted" || enquiry.status === "declined",
  );

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="Everything that has come in from the website. Emergencies first, then oldest."
      />

      {all.length === 0 ? (
        <EmptyState
          icon={<TrayIcon size={28} weight="duotone" />}
          title="Nothing has come in yet"
          description="When someone fills in the request form on your website it lands here — with their photos, their postcode and how urgent they say it is. You get an email at the same time."
          action={{ label: "See the request form", href: "/request" }}
        />
      ) : (
        <div className="flex flex-col gap-10">
          {open.length > 0 ? (
            <section>
              <h2 className="text-label uppercase text-ink-subtle">
                Needs you ({open.length})
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {open.map((enquiry) => (
                  <EnquiryRow key={enquiry.id} enquiry={enquiry} />
                ))}
              </ul>
            </section>
          ) : (
            <EmptyState
              icon={<TrayIcon size={28} weight="duotone" />}
              title="Inbox clear"
              description="Every enquiry has been dealt with. New ones will appear here."
            />
          )}

          {closed.length > 0 ? (
            <section>
              <h2 className="text-label uppercase text-ink-subtle">Dealt with</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {closed.map((enquiry) => (
                  <EnquiryRow key={enquiry.id} enquiry={enquiry} muted />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

type EnquiryRowData = {
  id: string;
  reference: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  description: string;
  urgency: "emergency" | "soon" | "flexible";
  status: "new" | "read" | "converted" | "declined";
  postcode: string | null;
  service_label: string | null;
  created_at: string;
};

function EnquiryRow({ enquiry, muted = false }: { enquiry: EnquiryRowData; muted?: boolean }) {
  const isUnread = enquiry.status === "new";

  return (
    <li>
      <Link
        href={`/app/enquiries/${enquiry.id}`}
        className={cn(
          "group flex gap-4 rounded-lg border p-5 shadow-subtle",
          "transition-[border-color,box-shadow,transform] duration-200",
          "[transition-timing-function:var(--ease-standard)]",
          "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float",
          // Unread is marked by weight and a dot, not by colour alone.
          isUnread ? "border-accent-line bg-accent-soft" : "border-line bg-surface-raised",
          muted && "opacity-70",
        )}
      >
        {isUnread ? (
          <span
            aria-hidden="true"
            className="mt-2 size-2.5 shrink-0 rounded-full bg-accent"
          />
        ) : (
          <span aria-hidden="true" className="mt-2 size-2.5 shrink-0" />
        )}

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={cn("text-ink", isUnread ? "font-semibold" : "font-medium")}>
              {enquiry.full_name}
            </span>

            <UrgencyBadge urgency={enquiry.urgency} />

            {enquiry.status === "converted" ? <Badge tone="positive">Made a job</Badge> : null}
            {enquiry.status === "declined" ? <Badge tone="neutral">Declined</Badge> : null}
            {isUnread ? <span className="sr-only">Unread</span> : null}
          </span>

          <span className="mt-1.5 line-clamp-2 block text-[0.9375rem] leading-snug text-ink-muted">
            {enquiry.description}
          </span>

          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
            <span className="font-mono tabular-nums">{enquiry.reference}</span>
            {enquiry.service_label ? <span>· {enquiry.service_label}</span> : null}
            {enquiry.postcode ? <span>· {enquiry.postcode}</span> : null}
            {enquiry.phone ? <span className="tabular">· {enquiry.phone}</span> : null}
            <span>· {formatRelative(enquiry.created_at)}</span>
          </span>
        </span>

        <ArrowRightIcon
          size={18}
          weight="bold"
          aria-hidden="true"
          className="mt-1 shrink-0 self-start text-ink-subtle transition-transform duration-300 group-hover:translate-x-1 group-hover:text-accent"
        />
      </Link>
    </li>
  );
}
