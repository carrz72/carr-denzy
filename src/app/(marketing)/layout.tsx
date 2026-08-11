import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ClosureNotice } from "@/components/marketing/closure-notice";
import { getClosureNotice } from "@/lib/closures";
import { localBusinessJsonLd } from "@/lib/site";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Site-wide rather than per-page: somebody landing on a service page from a
  // search result needs to know the business is away just as much as somebody
  // on the home page.
  const closure = await getClosureNotice();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <ClosureNotice notice={closure} />

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter />

      {/*
        The only dangerouslySetInnerHTML in the application. The object is
        hard-coded in src/lib/site.ts and never touches user input, which is
        exactly why it is safe here and would not be anywhere else.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd(siteUrl)) }}
      />
    </div>
  );
}
