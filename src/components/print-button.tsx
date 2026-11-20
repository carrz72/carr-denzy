"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FilePdfIcon, PrinterIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

/**
 * Getting a copy of the document out: a real PDF file, and printing.
 *
 * The PDF never navigates away. Opening it as a link in an iPhone home-screen
 * app swaps the whole app for a bare PDF viewer, or bounces out to Safari, and
 * either way the only route back is leaving the app. Instead the file is
 * fetched in the background and then:
 *
 *   - on phones (anything that can share files): handed to the share sheet,
 *     which slides up over the app — Save to Files, Print, Mail, WhatsApp —
 *     and closes back to where you were;
 *   - everywhere else: saved as a download with its proper file name.
 *
 * On a phone the file is fetched when the button appears, not when it is
 * tapped. iOS only lets a page open the share sheet straight from a tap, and a
 * network round trip in between can use up that permission; with the file
 * already in hand the share happens in the same tap.
 *
 * Print is hidden in the iPhone home-screen app, where `window.print()` does
 * nothing, and kept everywhere else for the print stylesheet in globals.css.
 */
export function PrintButton({
  label = "Print",
  pdfHref,
}: {
  label?: string;
  pdfHref?: string;
}) {
  const [canPrint, setCanPrint] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefetched = useRef<Promise<File> | null>(null);

  const loadPdf = useCallback(async (): Promise<File> => {
    if (!pdfHref) throw new Error("No PDF for this document.");
    const response = await fetch(pdfHref, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`PDF request failed: ${response.status}`);
    const blob = await response.blob();
    return new File([blob], fileNameFrom(response, pdfHref), { type: "application/pdf" });
  }, [pdfHref]);

  useEffect(() => {
    const iosStandalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setCanPrint(!iosStandalone && typeof window.print === "function");

    // Prefetch only where the share sheet will be used, so desktops do not
    // download every PDF just by opening the page.
    if (pdfHref && canShareFiles()) {
      const pending = loadPdf();
      pending.catch(() => {
        // Retried on tap.
        prefetched.current = null;
      });
      prefetched.current = pending;
    }
  }, [pdfHref, loadPdf]);

  async function download() {
    if (!pdfHref) return;
    setError(null);
    setBusy(true);

    try {
      const file = await (prefetched.current ?? loadPdf());

      if (canShareFiles() && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: file.name });
        } catch (shareError) {
          // Closing the share sheet is not a failure.
          if ((shareError as DOMException)?.name === "AbortError") return;
          // The tap permission ran out while the file loaded. It is loaded
          // now, so the next tap shares immediately.
          if ((shareError as DOMException)?.name === "NotAllowedError") {
            prefetched.current = Promise.resolve(file);
            setError("Ready — tap Download PDF again to save or share it.");
            return;
          }
          throw shareError;
        }
        return;
      }

      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (downloadError) {
      console.error("[pdf] download failed", downloadError);
      setError("The PDF did not load. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {pdfHref ? (
        <Button
          variant="secondary"
          fullWidth
          loading={busy}
          loadingLabel="Getting the PDF…"
          onClick={download}
          icon={<FilePdfIcon size={19} />}
        >
          Download PDF
        </Button>
      ) : null}

      {error ? <FormError message={error} /> : null}

      {!canPrint && !pdfHref ? (
        // Nothing else to offer here, so say why rather than show an empty space.
        <p className="text-sm leading-relaxed text-ink-muted">
          Printing does not work inside the home-screen app. Open this page in Safari to print it.
        </p>
      ) : null}

      {canPrint ? (
        <Button
          variant={pdfHref ? "quiet" : "secondary"}
          fullWidth
          onClick={() => window.print()}
          icon={<PrinterIcon size={19} />}
        >
          {label}
        </Button>
      ) : null}
    </div>
  );
}

/** Phones and tablets that can hand a file to the system share sheet. */
function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    const probe = new File([new Blob(["%PDF"])], "probe.pdf", { type: "application/pdf" });
    // Desktop Chrome and Safari can share files too, but a plain download is
    // what people expect there. Touch-first devices get the share sheet.
    const touchFirst = window.matchMedia("(pointer: coarse)").matches;
    return touchFirst && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** The file name from Content-Disposition, falling back to the URL. */
function fileNameFrom(response: Response, href: string): string {
  const header = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(header);
  if (match?.[1]) return match[1];
  const fromPath = href.split("/").filter(Boolean).slice(-2, -1)[0];
  return `${fromPath ?? "document"}.pdf`;
}
