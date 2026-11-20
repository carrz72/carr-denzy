"use client";

import { useEffect, useState } from "react";
import { FilePdfIcon, PrinterIcon } from "@phosphor-icons/react/dist/ssr";
import { Button, buttonClasses } from "@/components/ui/button";

/**
 * Getting a copy of the document out: a real PDF file, and printing.
 *
 * The PDF link comes first because it works everywhere, including the iPhone
 * home-screen app, where `window.print()` silently does nothing. It opens in a
 * new tab, which in a standalone iOS app means the in-app browser sheet with a
 * Done button and the share menu (Save to Files, Print, Mail) — rather than
 * replacing the app's only window with a PDF and no way back.
 *
 * The print button is hidden in that one case, since it cannot work there,
 * and kept everywhere else for the print stylesheet in globals.css.
 */
export function PrintButton({
  label = "Print",
  pdfHref,
}: {
  label?: string;
  pdfHref?: string;
}) {
  const [canPrint, setCanPrint] = useState(true);

  useEffect(() => {
    const iosStandalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setCanPrint(!iosStandalone && typeof window.print === "function");
  }, []);

  return (
    <div className="flex flex-col gap-2.5">
      {pdfHref ? (
        <a
          href={pdfHref}
          target="_blank"
          rel="noopener"
          className={buttonClasses({ variant: "secondary", fullWidth: true })}
        >
          <FilePdfIcon size={19} aria-hidden />
          Download PDF
        </a>
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
