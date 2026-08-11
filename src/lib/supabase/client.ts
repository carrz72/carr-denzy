"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Browser Supabase client.
 *
 * Only ever uses the anon key. Every table is behind Row Level Security, so
 * this key on its own grants nothing — the user's session is what unlocks
 * rows. The service role key must never appear in a file that reaches here.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
