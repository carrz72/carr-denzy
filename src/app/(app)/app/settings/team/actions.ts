"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasPermission, requireOwner, requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendTeamInvite } from "@/lib/email";
import { emailSchema } from "@/lib/validation";
import type { StaffLevel } from "@/types/database";

/**
 * the owner's team: people with their own login to the business app and a set of
 * permissions he chooses. The rules themselves live in the database (see the
 * team_permissions migration); this file only adds, changes and removes them.
 */

export interface TeamActionResult {
  ok: boolean;
  message?: string;
  formError?: string;
  errors?: Record<string, string>;
}

const LEVELS: StaffLevel[] = ["jobs", "jobs_quotes", "office"];

const permissionsSchema = z.object({
  level: z.enum(["jobs", "jobs_quotes", "office"]),
  see_all_jobs: z.boolean(),
  manage_jobs: z.boolean(),
  see_prices: z.boolean(),
  manage_quotes: z.boolean(),
  manage_invoices: z.boolean(),
  record_payments: z.boolean(),
});

type Permissions = z.infer<typeof permissionsSchema>;

function readPermissions(formData: FormData): Permissions | null {
  const on = (name: string) => formData.get(name) === "on";
  const level = String(formData.get("level") ?? "");
  const parsed = permissionsSchema.safeParse({
    level: LEVELS.includes(level as StaffLevel) ? level : "jobs",
    see_all_jobs: on("see_all_jobs"),
    manage_jobs: on("manage_jobs"),
    see_prices: on("see_prices"),
    manage_quotes: on("manage_quotes"),
    manage_invoices: on("manage_invoices"),
    record_payments: on("record_payments"),
  });
  if (!parsed.success) return null;

  const p = parsed.data;
  // The same rules the database holds, applied first so the owner gets a form
  // that makes sense rather than an error: adding jobs means seeing all of
  // them, and handling money means seeing it.
  if (p.manage_jobs) p.see_all_jobs = true;
  if (p.manage_quotes || p.manage_invoices || p.record_payments) p.see_prices = true;
  return p;
}

/** Has a customer record (someone the owner has done work for), not just a spare login. */
async function isCustomer(profileId: string): Promise<boolean> {
  const admin = createAdminClient();
  const [{ count: own }, { count: member }] = await Promise.all([
    admin.from("clients").select("id", { count: "exact", head: true }).eq("profile_id", profileId),
    admin.from("client_members").select("id", { count: "exact", head: true }).eq("profile_id", profileId),
  ]);
  return (own ?? 0) + (member ?? 0) > 0;
}

const nameSchema = z.string().trim().min(2, "Their name, please").max(120);

export async function addTeamMember(formData: FormData): Promise<TeamActionResult> {
  const owner = await requireOwner();

  const name = nameSchema.safeParse(formData.get("full_name") ?? "");
  const email = emailSchema.safeParse(formData.get("email") ?? "");
  const errors: Record<string, string> = {};
  if (!name.success) errors.full_name = name.error.issues[0]?.message ?? "Their name, please";
  if (!email.success) errors.email = email.error.issues[0]?.message ?? "Check the email address";
  const permissions = readPermissions(formData);
  if (!permissions) return { ok: false, formError: "Choose what they can do." };
  if (Object.keys(errors).length > 0 || !name.success || !email.success) return { ok: false, errors };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", email.data)
    .maybeSingle();

  let profileId = existing?.id ?? null;

  if (existing?.role === "owner") {
    return { ok: false, errors: { email: "That email is already an owner of the business." } };
  }
  if (existing?.role === "client" && (await isCustomer(existing.id))) {
    // A customer login would suddenly see the business side. Too surprising
    // to do silently; a separate email for work is the safe answer.
    return {
      ok: false,
      errors: { email: "That email is a customer's account. Use a different email for their work login." },
    };
  }

  if (!profileId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: email.data,
      email_confirm: true,
      user_metadata: { full_name: name.data },
    });
    if (error || !created.user) {
      console.error("[team] could not create login", error?.message);
      return { ok: false, formError: "Could not set up their login. Try again." };
    }
    profileId = created.user.id;
  }

  // Role first in the profile (what the database trusts) and in the token
  // claim (what the app reads), then the permissions that make it count.
  const { error: roleError } = await admin
    .from("profiles")
    .update({ role: "staff", full_name: name.data })
    .eq("id", profileId);
  if (roleError) {
    console.error("[team] could not set role", roleError.message);
    return { ok: false, formError: "Could not set up their login. Try again." };
  }
  await admin.auth.admin.updateUserById(profileId, {
    app_metadata: { role: "staff" },
    user_metadata: { full_name: name.data },
  });

  const { error: permError } = await admin.from("staff_permissions").upsert({
    profile_id: profileId,
    ...permissions,
    updated_by: owner.id,
    updated_at: new Date().toISOString(),
  });
  if (permError) {
    console.error("[team] could not save permissions", permError.message);
    return { ok: false, formError: "Could not save what they can do. Try again." };
  }

  const sent = await sendTeamInvite(email.data, name.data);

  revalidatePath("/app/settings/team");
  return {
    ok: true,
    message: sent.sent
      ? `${name.data} is added. They have an email telling them how to sign in.`
      : `${name.data} is added, but the email did not go. Tell them to sign in at the website with ${email.data}.`,
  };
}

export async function updateTeamMember(formData: FormData): Promise<TeamActionResult> {
  const owner = await requireOwner();
  const profileId = String(formData.get("profile_id") ?? "");
  if (!z.string().uuid().safeParse(profileId).success) return { ok: false, formError: "That person was not found." };

  const permissions = readPermissions(formData);
  if (!permissions) return { ok: false, formError: "Choose what they can do." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("staff_permissions")
    .update({ ...permissions, updated_by: owner.id, updated_at: new Date().toISOString() })
    .eq("profile_id", profileId);
  if (error) {
    console.error("[team] update failed", error.message);
    return { ok: false, formError: "Could not save that. Try again." };
  }

  revalidatePath("/app/settings/team");
  return { ok: true, message: "Saved. It applies the next time they open a page." };
}

export async function removeTeamMember(profileId: string): Promise<TeamActionResult> {
  await requireOwner();
  if (!z.string().uuid().safeParse(profileId).success) return { ok: false, formError: "That person was not found." };

  const admin = createAdminClient();

  // Deleting the permissions row is what cuts access, at once: every staff
  // rule in the database checks for it. The rest is tidying.
  const { error } = await admin.from("staff_permissions").delete().eq("profile_id", profileId);
  if (error) {
    console.error("[team] remove failed", error.message);
    return { ok: false, formError: "Could not remove them. Try again." };
  }

  await admin.from("profiles").update({ role: "client" }).eq("id", profileId).eq("role", "staff");
  await admin.auth.admin.updateUserById(profileId, { app_metadata: { role: "client" } });
  await admin.from("push_subscriptions").delete().eq("profile_id", profileId);
  await admin.from("jobs").update({ assigned_to: null }).eq("assigned_to", profileId);

  revalidatePath("/app/settings/team");
  return { ok: true, message: "Removed. They can no longer see anything in the business app." };
}

/** Who is doing a job. Null hands it back to nobody in particular. */
export async function assignJob(jobId: string, profileId: string | null): Promise<TeamActionResult> {
  await requireStaff();
  if (!(await hasPermission("manage_jobs"))) {
    return { ok: false, formError: "You do not have permission to do that. Ask the owner." };
  }
  if (!z.string().uuid().safeParse(jobId).success) return { ok: false, formError: "That job was not found." };
  if (profileId !== null && !z.string().uuid().safeParse(profileId).success) {
    return { ok: false, formError: "That person was not found." };
  }

  if (profileId) {
    const admin = createAdminClient();
    const { data: person } = await admin.from("profiles").select("role").eq("id", profileId).maybeSingle();
    if (!person || (person.role !== "staff" && person.role !== "owner")) {
      return { ok: false, formError: "That person is not on the team." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("jobs").update({ assigned_to: profileId }).eq("id", jobId);
  if (error) {
    console.error("[team] assign failed", error.message);
    return { ok: false, formError: "Could not save that. Try again." };
  }

  revalidatePath(`/app/jobs/${jobId}`);
  return { ok: true, message: "Saved." };
}
