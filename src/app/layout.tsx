import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * Fonts.
 *
 * Not Inter. Inter is the default of every AI-generated interface and reads as
 * "no decision was made here".
 *
 *   Bricolage Grotesque — display. Slightly irregular, industrial, and it has
 *     an opinion. Suits a trade business far better than a neutral grotesque.
 *   Geist — body. Highly legible at small sizes, which matters when the reader
 *     may be sixty and holding a phone at arm's length.
 *   Geist Mono — figures only. Money lines up in columns and stops jittering
 *     as it changes.
 *
 * All three are self-hosted by next/font, so there is no request to Google at
 * runtime, no layout shift, and no third-party origin to allow in the CSP.
 */

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
  weight: ["500", "600", "700", "800"],
});

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Carr Denzy Plumbing & Gas — plumbers, heating and building repairs",
    template: "%s · Carr Denzy",
  },
  description:
    "Gas Safe registered plumbers covering Nottingham and the surrounding areas. Leaks and repairs, boiler servicing, heating, bathrooms and building work. Same-day emergency call-outs.",
  applicationName: "Carr Denzy",
  keywords: [
    "plumber Nottingham",
    "Gas Safe engineer",
    "emergency plumber",
    "boiler repair",
    "boiler service",
    "bathroom fitting",
    "building repairs",
  ],
  authors: [{ name: "Carr Denzy Plumbing & Gas" }],
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: "Carr Denzy Plumbing & Gas",
    title: "Carr Denzy Plumbing & Gas",
    description:
      "Gas Safe registered plumbers covering Nottingham. Leaks, boilers, heating, bathrooms and building work.",
    images: [{ url: "/images/work-33.webp", width: 1200, height: 630, alt: "Carr Denzy at work" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Carr Denzy Plumbing & Gas",
    description: "Gas Safe registered plumbers covering Nottingham and Nottinghamshire.",
    images: ["/images/work-33.webp"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Carr Denzy",
    statusBarStyle: "default",
  },
  /**
   * Icons, ordered for Google as much as for browsers.
   *
   * Google shows a site icon beside the search result, and it has two
   * requirements this used to fail. It looks for a root-level `/favicon.ico`
   * first — there wasn't one, so the result showed the grey globe. And the
   * icon it picks must be square with sides a MULTIPLE OF 48px; the 32x32 that
   * was declared first is not, so even once found it was not a candidate.
   *
   * 48, 96 and 144 are all multiples of 48. The 32 is kept last, purely for
   * browser tabs, where it is the right size and Google is not looking.
   */
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32 48x48", type: "image/x-icon" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/favicon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/icons/favicon-144.png", sizes: "144x144", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: true, address: true },
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
  // Never lock zoom. Pinch-to-zoom is how a user with low vision reads a page,
  // and disabling it is an accessibility failure, not a design choice.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-GB"
      className={`${bricolage.variable} ${geist.variable} ${geistMono.variable}`}
    >
      <body className="grain min-h-dvh antialiased">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
