import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ClosureNotice } from "@/components/marketing/closure-notice";
import { getClosureNotice } from "@/lib/closures";
import { getBusiness } from "@/lib/business";
import { localBusinessJsonLd } from "@/lib/site";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Site-wide rather than per-page: somebody landing on a service page from a
  // search result needs to know the business is away just as much as somebody
  // on the home page.
  //
  // Contact details come from Settings so the owner can change the phone
  // number without a developer. `getBusiness` is request-cached, so fetching it
  // here for the header, the footer and the structured data is one query.
  const [closure, contact] = await Promise.all([getClosureNotice(), getBusiness()]);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader contact={contact} />

      <ClosureNotice notice={closure} contact={contact} />

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter contact={contact} />

      {/*
        The only dangerouslySetInnerHTML in the application. The object is
        assembled in src/lib/site.ts from hard-coded values plus the owner's own
        contact details — never from anything a visitor can supply, which is
        exactly why it is safe here and would not be anywhere else.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd(siteUrl, contact)) }}
      />
    </div>
  );
}
