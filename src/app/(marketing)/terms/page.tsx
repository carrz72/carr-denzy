import type { Metadata } from "next";
import { business } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms on which Carr Denzy Plumbing & Gas quotes for and carries out work.",
  robots: { index: false, follow: true },
};

/**
 * A working draft, not legal advice. Same caveat as the privacy policy, and
 * it is stated on the page for the same reason.
 */
export default function TermsPage() {
  return (
    <article className="section-y">
      <div className="container-page">
        <div className="container-prose">
          <p className="text-label uppercase text-accent">Legal</p>

          <h1 className="mt-3 font-display text-title text-ink">Terms of service</h1>

          <p className="mt-4 text-sm text-ink-subtle">Last updated: 10 August 2026</p>

          <div className="mt-10 flex flex-col gap-8 leading-relaxed text-ink">
            <section>
              <h2 className="font-display text-subheading">Quotes</h2>
              <p className="mt-2 text-ink-muted">
                A quote is valid for the period stated on it, normally 30 days. It covers
                the work described and nothing else. Where work is priced from photographs
                rather than a visit, the quote assumes the problem is as it appears; if we
                find something materially different on arrival we will stop, explain, and
                give you a revised price before continuing. You are free to decline at that
                point and pay only for the call-out.
              </p>
            </section>

            <section>
              <h2 className="font-display text-subheading">Accepting a quote</h2>
              <p className="mt-2 text-ink-muted">
                Accepting a quote through your account, by email or in writing forms a
                contract between us. Accepting one quote automatically withdraws any other
                open quote for the same job.
              </p>
            </section>

            <section>
              <h2 className="font-display text-subheading">Access and appointments</h2>
              <p className="mt-2 text-ink-muted">
                We will give you a date and an arrival window. If nobody is at the property
                during that window and we cannot gain access, we may charge the call-out
                fee. If we are going to be late we will ring you. If you need to
                reschedule, as much notice as you can give is appreciated but there is no
                cancellation charge for a domestic job cancelled before the day.
              </p>
            </section>

            <section>
              <h2 className="font-display text-subheading">Payment</h2>
              <p className="mt-2 text-ink-muted">
                Invoices are payable by bank transfer within the period stated on the
                invoice, normally 14 days. Bank details and a payment reference are printed
                on every invoice. Larger projects are invoiced in stages tied to completed
                work, agreed in writing beforehand. We do not take card payments at present.
              </p>
            </section>

            <section>
              <h2 className="font-display text-subheading">Guarantee</h2>
              <p className="mt-2 text-ink-muted">
                Our workmanship is guaranteed for twelve months from completion. Parts and
                appliances carry their manufacturer&apos;s warranty, which we will register
                on your behalf where that applies. The guarantee does not cover damage
                caused by misuse, by freezing, by someone else&apos;s subsequent work, or by
                a pre-existing fault we identified in writing and you asked us not to
                address.
              </p>
            </section>

            <section>
              <h2 className="font-display text-subheading">Your right to cancel</h2>
              <p className="mt-2 text-ink-muted">
                Where you are a consumer and the contract was agreed away from our premises,
                you have 14 days to cancel. If you ask us to start work inside that period —
                which is usually what you want with an emergency — you may still cancel, but
                you will owe us for the work done up to that point.
              </p>
            </section>

            <section>
              <h2 className="font-display text-subheading">Complaints</h2>
              <p className="mt-2 text-ink-muted">
                Tell us first, on {business.phone} or at {business.email}. We would rather
                come back and put something right than argue about it. Gas work complaints
                can also be raised with the Gas Safe Register.
              </p>
            </section>

            <section>
              <h2 className="font-display text-subheading">General</h2>
              <p className="mt-2 text-ink-muted">
                These terms are governed by the law of England and Wales. Nothing in them
                limits your statutory rights as a consumer, or our liability for death or
                personal injury caused by negligence.
              </p>
            </section>

            <section className="rounded-lg border border-caution/30 bg-caution-soft p-5">
              <h2 className="font-display text-subheading text-caution-ink">
                A note on this document
              </h2>
              <p className="mt-2 text-ink">
                These terms are a working draft reflecting how the business operates. They
                have not been reviewed by a solicitor. If you are the business owner reading
                this: have them checked before you rely on them.
              </p>
            </section>
          </div>
        </div>
      </div>
    </article>
  );
}
