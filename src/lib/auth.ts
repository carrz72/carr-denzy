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

  await admin.from("audit_log").insert({
    actor_id: userId,
    action: "auth.signed_in",
    entity: "profile",
    entity_id: userId,
    detail: { role },
  });

  return role;
}
