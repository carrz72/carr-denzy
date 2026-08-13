import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Registers a device for push notifications.
 *
 * A route handler rather than a server action because the service worker calls
 * it too, from `pushsubscriptionchange` — and a service worker cannot invoke a
 * server action, only `fetch`.
 *
 * Identity comes from the session cookie, never from the body. The row is
 * written with the caller's own client so the "register own device" RLS policy
 * is what enforces `profile_id = auth.uid()` — a forged profile id in the
 * payload has nowhere to land.
 */

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  /** Set by pushsubscriptionchange when the service rotates an endpoint. */
  replaces: z.string().url().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const { subscription, replaces } = parsed.data;

  // Clear the rotated-out endpoint first, so a device that has been reissued
  // does not leave a dead row behind that keeps failing forever.
  if (replaces && replaces !== subscription.endpoint) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", replaces);
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      failure_count: 0,
    },
    // Re-subscribing on the same device returns the same endpoint. Upserting on
    // it means "this phone" stays one row rather than accumulating duplicates
    // that would each buzz separately.
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("[push] subscribe failed", error.message);
    return NextResponse.json({ error: "Could not register this device" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Turns notifications off for this device. */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let endpoint: string | null = null;
  try {
    const body = await request.json();
    endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  } catch {
    endpoint = null;
  }

  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  // RLS scopes the delete to this person's own rows regardless of what
  // endpoint is claimed, so somebody else's device cannot be unsubscribed.
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  if (error) {
    console.error("[push] unsubscribe failed", error.message);
    return NextResponse.json({ error: "Could not turn them off" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
