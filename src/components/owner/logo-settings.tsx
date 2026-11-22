"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { createClient } from "@/lib/supabase/client";
import { businessLogoUrl } from "@/lib/logo";
import { setBusinessLogo } from "@/app/(app)/app/settings/logo-actions";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * The logo printed top-left on every quote and invoice. Replacing it here
 * changes every document, on screen and in the PDF, from then on.
 */
export function LogoSettings({ logoPath }: { logoPath: string | null }) {
  const [current, setCurrent] = useState(logoPath);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);

    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setError("Use a PNG or JPG file. A PNG with a see-through background looks best.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That file is over 5 MB. Try a smaller copy of the logo.");
      return;
    }

    setBusy(true);
    try {
      const key = `logo-${Date.now()}.${file.type === "image/png" ? "png" : "jpg"}`;
      const { error: failed } = await createClient()
        .storage.from("branding")
        .upload(key, file, { contentType: file.type, upsert: false });

      if (failed) {
        console.error("[settings] logo upload failed", failed.message);
        setError("The logo did not upload. Check your signal and try again.");
        return;
      }

      const result = await setBusinessLogo(key);
      if (!result.ok) {
        setError(result.error ?? "The logo could not be saved.");
        return;
      }
      setCurrent(key);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function switchToStandard() {
    setError(null);
    startTransition(async () => {
      const result = await setBusinessLogo(null);
      if (!result.ok) setError(result.error ?? "Could not switch back.");
      else setCurrent(null);
    });
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="font-medium text-ink">Logo on quotes and invoices</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Printed top left on every quote and invoice. Upload a new one and every document uses it
        from then on.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-5">
        <div className="flex h-24 w-44 items-center justify-center rounded-md border border-line bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={businessLogoUrl(current)} alt="Current logo" className="max-h-full max-w-full object-contain" />
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            id="logo-file"
            onChange={(event) => upload(event.target.files?.[0])}
          />
          <Button type="button" onClick={() => input.current?.click()} disabled={busy || pending}>
            {busy ? "Uploading…" : "Upload a new logo"}
          </Button>
          {current ? (
            <Button type="button" variant="secondary" onClick={switchToStandard} disabled={busy || pending}>
              Use the standard logo
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
