"use client";

import { PrinterIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";

/**
 * Printing is not a fallback here — it is how half of these documents reach a
 * customer, and "Save as PDF" in the browser's print dialogue is what produces
 * the PDF (spec FR-26). The print stylesheet in globals.css does the rest.
 */
export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <Button
      variant="secondary"
      fullWidth
      onClick={() => window.print()}
      icon={<PrinterIcon size={19} />}
    >
      {label}
    </Button>
  );
}
