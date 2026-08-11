"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { finishSignIn } from "@/app/auth/complete/actions";

/**
 * The browser half of the sign-in callback.
 *
 * Only reached when Supabase returned an implicit-flow link — bare tokens in a
 * `#access_token=…` fragment. The server cannot see a fragment, so this page
 * exists purely to read it, hand the tokens to the Supabase browser client
 * (which writes them to cookies), and then let the server finish up.
 *
 * It renders a plain "signing you in" state rather than a spinner over nothing,
 * because on a slow connection this page is visible for a second or two and a
 * bare spinner reads as a hang.
 */
export default function AuthCompletePage() {
  return (
    <Suspense fallback={<Shell>Signing you in…</Shell>}>
      <CompleteSignIn />
    </Suspense>
  );
}

function CompleteSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [failed, setFailed] = useState(false);

  // Strict Mode runs effects twice in development, and consuming a one-time
  // token twice would fail the second time and look like a broken link.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      // `location.hash` is the only place these tokens exist. It never reached
      // the server, and it is not in searchParams either.
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      const fragmentError = fragment.get("error_description") ?? fragment.get("error");

      if (fragmentError) {
        router.replace(
          `/sign-in?error=${/expired/i.test(fragmentError) ? "expired" : "invalid"}`,
        );
        return;
      }

      if (!accessToken || !refreshToken) {
        // No code, no token_hash, no fragment. Nothing to sign in with.
        router.replace("/sign-in?error=missing");
        return;
      }

      const supabase = createClient();

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error("[auth] setSession failed", error.message);
        setFailed(true);
        router.replace("/sign-in?error=invalid");
        return;
      }

      // Drop the tokens out of the address bar before going anywhere, so they
      // are not sitting in history or in a screenshot.
      window.history.replaceState(null, "", window.location.pathname);

      const result = await finishSignIn();

      const next = searchParams.get("next");
      const destination =
        next && next.startsWith("/") && !next.startsWith("//") ? next : result.destination;

      router.replace(destination);
    }

    void run();
  }, [router, searchParams]);

  return <Shell>{failed ? "That link did not work." : "Signing you in…"}</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-sunken px-6">
      <p role="status" className="text-center text-lg text-ink-muted">
        {children}
      </p>
    </div>
  );
}
