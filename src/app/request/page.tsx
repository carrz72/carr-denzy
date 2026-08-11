import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeftIcon, CheckIcon, PhoneIcon } from "@phosphor-icons/react/dist/ssr";
import { RequestForm } from "@/components/request/request-form";
import { ClosureNotice } from "@/components/marketing/closure-notice";
import { getClosureNotice } from "@/lib/closures";
import { getMyClient, getSessionUser } from "@/lib/auth";
import { business, getService } from "@/lib/site";

export const metadata: Metadata = {
  title: "Request a job",
  description:
    "Tell us what has gone wrong, attach photos from your phone, and get a written quote. No account needed.",
  robots: { index: true, follow: true },
};

/**
 * The enquiry page.
 *
 * Deliberately outside the marketing layout: no site navigation, no footer
 * link farm, nothing to click except the form and the phone number. Once
 * someone has decided to make an enquiry, every other link on the page is a
 * chance to lose them.
 */
export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; problem?: string }>;
}) {
  const params = await searchParams;

  // Nobody is required to sign in to use this page — that is the whole point of
  // it. But if they already are, their details are prefilled and the enquiry is
  // attached to their account, which is what makes a landlord's fourth request
  // of the month bearable.
  const [user, client, closure] = await Promise.all([
    getSessionUser(),
    getMyClient(),
    getClosureNotice(),
  ]);

  // A signed-in client may not have a linked customer record yet (spec: normal
  // for someone who signed up before the owner created anything for them) —
  // the "came from the portal" check must not depend on that record existing.
  const isSignedInClient = user?.role === "client";

  // Deep links from the home page arrive with a service and a problem
  // pre-filled. Both are validated here — `service` is only honoured if it
  // matches a real slug, and `problem` is passed to React as text, never HTML.
  const service = params.service ? getService(params.service) : undefined;
  const problem =
    typeof params.problem === "string" && params.problem.length <= 120
      ? params.problem
      : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunken">
      <header className="border-b border-line bg-surface-raised">
        <div className="container-page flex h-(--header-height) items-center justify-between gap-4">
          <Link
            // A signed-in customer came from their account, not the marketing site.
            href={isSignedInClient ? "/portal" : "/"}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-muted hover:text-accent"
          >
            <ArrowLeftIcon size={17} weight="bold" aria-hidden="true" />
            <span className="hidden sm:inline">
              {isSignedInClient ? "Back to your account" : "Back to the website"}
            </span>
            <span className="sm:hidden">Back</span>
          </Link>

          <a
            href={business.phoneHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 font-medium text-ink hover:bg-surface-sunken"
          >
            <PhoneIcon size={18} weight="fill" className="text-accent" aria-hidden="true" />
            <span className="tabular">{business.phone}</span>
          </a>
        </div>
      </header>

      {/* Especially here: this is the page where somebody is about to expect a
          reply, and being told first is the difference between a patient
          customer and a lost one. */}
      <ClosureNotice notice={closure} />

      <main id="main" className="flex-1">
        <div className="container-page py-10 md:py-14">
          <div className="mx-auto max-w-2xl">
            <p className="text-label uppercase text-accent">Request a job</p>

            <h1 className="mt-3 font-display text-title text-ink">
              {service ? service.name : "Tell us what has gone wrong."}
            </h1>

            <p className="mt-4 text-lg leading-relaxed text-ink-muted">
              It takes about two minutes. You do not need an account, and you will get a
              reference number straight away.
            </p>

            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
              {[
                "No account needed",
                "Photos help us price it",
                "Reply the same working day",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-ink-muted">
                  <CheckIcon
                    size={15}
                    weight="bold"
                    className="shrink-0 text-positive"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-9 rounded-2xl border border-line bg-surface-raised p-6 shadow-raised sm:p-9">
              <RequestForm
                initialServiceSlug={service?.slug}
                initialProblem={problem}
                isSignedIn={isSignedInClient}
                signedInAs={
                  client
                    ? {
                        fullName: client.full_name,
                        email: client.email,
                        phone: client.phone,
                      }
                    : null
                }
              />
            </div>

            <p className="mt-8 text-center text-sm leading-relaxed text-ink-subtle">
              Would rather talk to someone? Ring{" "}
              <a
                href={business.phoneHref}
                className="font-medium tabular text-ink underline underline-offset-4 hover:text-accent"
              >
                {business.phone}
              </a>{" "}
              — {business.hours.weekdays} on weekdays.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
