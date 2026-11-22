import { WhatsappLogoIcon } from "@phosphor-icons/react/dist/ssr";

/**
 * The floating "WhatsApp us" button on every public page.
 *
 * Bottom right, where people expect it, in WhatsApp's own green so it is
 * recognised at a glance rather than read. On a phone it is the icon alone, so
 * it never covers the text it floats over; from the sm breakpoint up it
 * carries its label. It opens wa.me, which hands over to the WhatsApp app on a
 * phone and to WhatsApp Web on a computer, with a greeting already typed.
 *
 * Renders nothing when the business number is not a mobile.
 */
export function WhatsAppButton({ href }: { href: string | null }) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Message us on WhatsApp"
      className="no-print fixed right-4 bottom-4 z-(--z-header) flex items-center gap-2 rounded-full bg-[#25D366] p-3.5 font-semibold text-white shadow-float transition-[transform,background-color] duration-200 [transition-timing-function:var(--ease-standard)] hover:-translate-y-0.5 hover:bg-[#1ebe5b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#128C7E] sm:right-6 sm:bottom-6 sm:px-5"
      style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
    >
      <WhatsappLogoIcon size={26} weight="fill" aria-hidden="true" />
      <span className="hidden sm:inline">WhatsApp us</span>
    </a>
  );
}
