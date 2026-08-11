"use server";

import { createClient } from "@/lib/supabase/server";
import { syncUserRole } from "@/lib/auth";

/**
 * Finishes an implicit-flow sign-in once the browser has put the session into
 * cookies.
 *
 * The tokens arrived in a URL fragment, which the server never sees, so the
 * client establishes the session first and then calls this to do the part that
 * needs the service key: bring the role claim in line with the durable record
 * and decide where this person belongs.
 *
 * Nothing is trusted from the caller. The user is read back from the session
 * cookie the browser just wrote, so a crafted call gets whoever it actually is
 * — or nothing.
 */
export async function finishSignIn(): Promise<{ ok: boolean; destination: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { ok: false, destination: "/sign-in?error=invalid" };
  }

  let role: string = "client";

  try {
    role = await syncUserRole(user.id, user.email);
  } catch (error) {
    console.error("[auth] role sync failed", error);
  }

  return {
    ok: true,
    destination: role === "owner" || role === "staff" ? "/app" : "/portal",
  };
}
