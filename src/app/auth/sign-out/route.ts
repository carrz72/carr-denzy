import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign out.
 *
 * POST only. A GET sign-out can be triggered by any image tag or prefetch on
 * a page the user visits, which logs people out at random.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/", request.nextUrl.origin), {
    // 303 forces the browser to follow with GET rather than repeating the POST.
    status: 303,
  });
}
