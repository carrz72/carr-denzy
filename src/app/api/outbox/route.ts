import { NextResponse, type NextRequest } from "next/server";
import { addJobNote } from "@/app/(app)/app/actions";

/**
 * Replay endpoint for the offline outbox.
 *
 * A queued item cannot call a server action directly — actions are invoked
 * through React's own protocol, which the service worker and a bare `fetch`
 * cannot reproduce. This route is the front door for replay, and it delegates
 * straight to the same action the online path uses, so there is exactly one
 * implementation of "add a note" and one set of validation rules.
 *
 * Authentication is the session cookie, which `fetch` sends automatically.
 * `addJobNote` calls `requireStaff()` itself, so a replayed item from a
 * signed-out device is refused just like a live one.
 */
export async function POST(request: NextRequest) {
  const kind = request.headers.get("x-outbox-kind");

  if (kind !== "job-note") {
    return NextResponse.json({ error: "Unknown item type" }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const result = await addJobNote(formData);

    if (!result.ok) {
      // 422 rather than 500: the item is malformed and retrying will not fix
      // it. The client counts the attempt and eventually surfaces it.
      return NextResponse.json(
        { error: result.formError ?? "Rejected", errors: result.errors },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[outbox] replay failed", error);
    return NextResponse.json({ error: "Could not replay" }, { status: 500 });
  }
}
