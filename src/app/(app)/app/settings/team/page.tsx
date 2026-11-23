import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { TeamManager, type TeamMember } from "@/components/owner/team";
import { requireOwner } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffPermissions } from "@/types/database";

export const metadata: Metadata = { title: "Team", robots: { index: false } };

export default async function TeamPage() {
  await requireOwner();

  // Admin read: the owner's own access does not reach other people's
  // sign-in records, and this page is owner-only.
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("staff_permissions")
    .select("*")
    .order("created_at", { ascending: true });

  const ids = (rows ?? []).map((row) => row.profile_id);
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("id, email, full_name").in("id", ids)
    : { data: [] as { id: string; email: string; full_name: string | null }[] };
  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const members: TeamMember[] = await Promise.all(
    ((rows ?? []) as StaffPermissions[]).map(async (r) => {
      const profile = byId.get(r.profile_id);
      const { data } = await admin.auth.admin.getUserById(r.profile_id);
      return {
        id: r.profile_id,
        name: profile?.full_name ?? profile?.email ?? "Team member",
        email: profile?.email ?? "",
        lastSignIn: data.user?.last_sign_in_at ?? null,
        permissions: {
          level: r.level,
          see_all_jobs: r.see_all_jobs,
          manage_jobs: r.manage_jobs,
          see_prices: r.see_prices,
          manage_quotes: r.manage_quotes,
          manage_invoices: r.manage_invoices,
          record_payments: r.record_payments,
        },
      };
    }),
  );

  return (
    <>
      <PageHeader
        title="Team"
        description="People with their own login to the business app, and what each of them can do."
        back={{ href: "/app/settings", label: "Settings" }}
      />

      <div className="mx-auto max-w-3xl">
        <TeamManager members={members} />
      </div>
    </>
  );
}
