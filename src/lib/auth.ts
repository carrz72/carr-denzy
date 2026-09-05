import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Client, Profile, UserRole } from "@/types/database";

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string | null;
}

/**
 * The signed-in user, or null.
 *
 * Reads the role from the JWT's app_metadata. That claim is written by
 * `syncUserRole()` below using the service key, so a user cannot set it — the
 * only writable copy of a role lives behind an RLS policy that pins it.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  return {
    id: user.id,
    email: user.email,
    role: ((user.app_metadata?.role as UserRole | undefined) ?? "client") satisfies UserRole,
    fullName:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.app_metadata?.full_name as string | undefined) ??
      null,
  };
}

/** Redirects to sign-in when there is no session. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    redirect(`/sign-in${next}`);
  }

  return user;
}

/** Owner or staff only. A client lands back in their own portal. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser("/app");

  if (user.role !== "owner" && user.role !== "staff") {
    redirect("/portal");
  }

  return user;
}

/** Owner only — anything touching money or settings. */
export async function requireOwner(): Promise<SessionUser> {
  const user = await requireUser("/app");

  if (user.role !== "owner") {
    redirect("/portal");
  }

  return user;
}

/**
 * The client record belonging to the signed-in person, if there is one.
 *
 * A profile without a client record is normal: someone can sign in before the
 * owner has ever created a job for them. The portal shows a composed empty
 * state in that case rather than an error.
 */
export async function getMyClient(): Promise<Client | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("clients")
    .select("*")
    .is("deleted_at", null)
    .maybeSingle();

  return data ?? null;
}

/**
 * Brings the JWT role claim in line with the durable record, and promotes the
 * configured owner email on its first sign-in.
 *
 * Called from the auth callback. Uses the service key because a client is not
 * permitted to write its own role under any circumstance (spec FR-18).
 */
export async function syncUserRole(userId: string, email: string): Promise<UserRole> {
  const admin = createAdminClient();

  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const isConfiguredOwner = Boolean(ownerEmail) && email.trim().toLowerCase() === ownerEmail;

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<Profile>();

  // A signed-in account with no profile row is quietly broken, in a way that
  // does not show up until it matters.
  //
  // `job_events.actor_id` is a foreign key to `profiles`, and every status
  // change writes one by trigger. So an account missing its profile can sign
  // in, load every screen, and then fail on "Start work" or "Mark finished"
  // with a foreign key error — the status silently does not move.
  //
  // The row is normally created by `handle_new_user()` when the auth user is
  // inserted, which means it only ever runs once. Delete a profile row while
  // tidying up test data, or import users, and nothing ever puts it back.
  // Recreating it here costs one query on sign-in and closes the hole.
  if (!profile) {
    const { error: repairError } = await admin
      .from("profiles")
      .insert({ id: userId, email, role: "client" });

    if (repairError) {
      console.error("[auth] could not recreate the missing profile", repairError.message);
    } else {
      console.info("[auth] recreated a missing profile row for", email);
    }
  }

  let role: UserRole = profile?.role ?? "client";

  if (isConfiguredOwner && role !== "owner") {
    role = "owner";

    await admin.from("profiles").update({ role }).eq("id", userId);

    await admin.from("audit_log").insert({
      actor_id: userId,
      action: "role.promoted",
      entity: "profile",
      entity_id: userId,
      detail: { to: "owner", reason: "matches OWNER_EMAIL" },
    });
  }

  // Mirror the durable role into app_metadata so RLS policies can read it from
  // the token instead of querying profiles on every row.
  const currentClaim = (await admin.auth.admin.getUserById(userId)).data.user?.app_metadata?.role;

  if (currentClaim !== role) {
    await admin.auth.admin.updateUserById(userId, { app_metadata: { role } });
  }

  // Adopt any customer record that belongs to this person but is not yet
  // attached to their login.
  //
  // `clients.profile_id` is what every portal policy filters on, so a customer
  // whose record was created after their account signs in successfully and
  // then sees "Nothing here yet" — their own jobs, invoices and photographs
  // are invisible, and they cannot reply on a job that is genuinely theirs.
  //
  // The database has triggers for this on both tables now, but they only fire
  // on rows written from here on. Doing it on every sign-in as well means an
  // account already in that broken state repairs itself the next time the
  // person logs in, rather than waiting for somebody to notice.
  //
  // Only ever fills a blank — `profile_id is null` — because repointing an
  // existing link would hand one customer's records to another.
  const { error: linkError } = await admin
    .from("clients")
    .update({ profile_id: userId })
    .is("profile_id", null)
    .is("deleted_at", null)
    .eq("email", email);

  if (linkError) console.error("[auth] could not link client record", linkError.message);

  await admin.from("audit_log").insert({
    actor_id: userId,
    action: "auth.signed_in",
    entity: "profile",
    entity_id: userId,
    detail: { role },
  });

  return role;
}
