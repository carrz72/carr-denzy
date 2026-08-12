import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeftIcon, PhoneIcon } from "@phosphor-icons/react/dist/ssr";
import { SignInForm } from "@/components/auth/sign-in-form";
import { business } from "@/lib/site";
import { getBusiness } from "@/lib/business";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Carr Denzy account to see your jobs, quotes and invoices.",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const contact = await getBusiness();

  const params = await searchParams;

  // Only ever accept a relative path. An absolute URL here would turn the
  // sign-in page into an open redirect that phishing could point anywhere.
  const next =
    typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunken">
      <header className="border-b border-line bg-surface-raised">
        <div className="container-page flex h-(--header-height) items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-muted hover:text-accent"
          >
            <ArrowLeftIcon size={17} weight="bold" aria-hidden="true" />
            Back to the website
          </Link>

          <a
            href={contact.phoneHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 font-medium text-ink hover:bg-surface-sunken"
          >
            <PhoneIcon size={18} weight="fill" className="text-accent" aria-hidden="true" />
            <span className="tabular">{contact.phone}</span>
          </a>
        </div>
      </header>

      <main id="main" className="flex flex-1 items-center">
        <div className="container-page py-14">
          <div className="mx-auto max-w-md">
            <h1 className="font-display text-title text-ink">Sign in</h1>

            <p className="mt-4 leading-relaxed text-ink-muted">
              There is no password to remember. Put your email address in and we will send
              you a link that signs you in.
            </p>

            <div className="mt-8 rounded-2xl border border-line bg-surface-raised p-6 shadow-raised sm:p-8">
              <SignInForm next={next} initialError={params.error} />
            </div>

            <p className="mt-8 text-center text-sm leading-relaxed text-ink-subtle">
              Not a customer yet?{" "}
              <Link
                href="/request"
                className="font-medium text-ink underline underline-offset-4 hover:text-accent"
              >
                Request a job
              </Link>{" "}
              — you do not need an account for that.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
