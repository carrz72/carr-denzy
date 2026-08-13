import type { Metadata } from "next";
import { business } from "@/lib/site";
import { getBusiness } from "@/lib/business";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  title: "Privacy policy",
  description: "How Carr Denzy Plumbing & Gas handles your personal information.",
  robots: { index: false, follow: true },
};

/**
 * A working draft, not legal advice.
 *
 * It accurately describes what this application actually does with data —
 * which is the part a template cannot get right — but a solicitor should read
 * it before it goes live. That caveat is stated on the page rather than hidden
 * in a code comment, because the business owner is the one who carries the
 * risk of it being wrong.
 */
export default async function PrivacyPage() {
  const contact = await getBusiness();

  return (
    <article className="section-y">
      <div className="container-page">
        <div className="container-prose">
          <p className="text-label uppercase text-accent">Legal</p>

          <h1 className="mt-3 font-display text-title text-ink">Privacy policy</h1>

          <p className="mt-4 text-sm text-ink-subtle">Last updated: 10 August 2026</p>

          <div className="mt-10 flex flex-col gap-8 leading-relaxed text-ink">
            <section>
              <h2 className="font-display text-subheading">Who we are</h2>
              <p className="mt-2 text-ink-muted">
                {contact.name}, {business.address.city}, {business.address.region}. We are
                the data controller for the information described here. You can reach us on{" "}
                {contact.phone} or at {contact.email}, and we will give you a postal
                address on request.
              </p>
            </section>

            <section>
              <h2 className="font-display text-subheading">What we collect</h2>
              <ul className="mt-2 flex flex-col gap-2 text-ink-muted">
                <li>
                  <strong className="text-ink">When you send an enquiry:</strong> your name,
                  the phone number or email address you give us, the address of the
                  property, a description of the problem, and any photographs you attach.
                </li>
                <li>
                  <strong className="text-ink">If we do work for you:</strong> the job
                  record, our notes and photographs, quotes, invoices and payment records.
                </li>
                <li>
                  <strong className="text-ink">If you sign in:</strong> your email address,
                  used to send you a one-time sign-in link. We do not store a password
                  because we do not use passwords.
                </li>
                <li>
                  <strong className="text-ink">Automatically:</strong> a one-way hash of
                  your IP address when you submit the enquiry form, kept for 24 hours to
                  stop the form being abused. We do not store the address itself, and there
                  is no advertising or analytics tracking on this site.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-subheading">Why we can hold it</h2>
              <p className="mt-2 text-ink-muted">
                For enquiries and job records, because it is necessary to take steps at your
                request and to perform our contract with you. For invoices and payment
                records, because we have a legal obligation to keep accounting records. For
                the rate-limit hash, because we have a legitimate interest in keeping the
                form working for genuine customers.
              </p>
            </section>

            <section>
              <h2 className="font-display text-subheading">How long we keep it</h2>
              <p className="mt-2 text-ink-muted">
                Invoices and their line items are kept for six years, because HMRC requires
                it. Enquiries that never become jobs are deleted after twelve months. Job
                photographs are kept for six years alongside the invoice, as they are often
                the only record of what was behind a wall. The rate-limit hash is deleted
                after 24 hours.
              </p>
            </section>

            <section>
              <h2 className="font-display text-subheading">Who else sees it</h2>
              <p className="mt-2 text-ink-muted">
                Our hosting provider (Vercel) and our database and file storage provider
                (Supabase) process data on our behalf. Emails are sent through Resend. We do
                not sell data, and we do not share it for marketing. Where a job requires a
                specialist subcontractor we will tell you before passing on your details.
              </p>
            </section>

            <section>
              <h2 className="font-display text-subheading">Your rights</h2>
              <p className="mt-2 text-ink-muted">
                You can ask for a copy of what we hold, ask us to correct it, ask us to
                delete it, or object to how we use it. Email {contact.email} and we will
                respond within one month. Note that we cannot delete an invoice inside the
                six-year retention period, as we are legally required to keep it. If you are
                unhappy with our response you can complain to the Information
                Commissioner&apos;s Office at ico.org.uk.
              </p>
            </section>

            <section>
              <h2 className="font-display text-subheading">Cookies</h2>
              <p className="mt-2 text-ink-muted">
                This site sets one cookie, and only once you sign in: the session cookie
                that keeps you signed in. It is strictly necessary for the service to work,
                so it does not require your consent and there is no cookie banner. We use no
                analytics, advertising or tracking cookies of any kind.
              </p>
            </section>

            <section className="rounded-lg border border-caution/30 bg-caution-soft p-5">
              <h2 className="font-display text-subheading text-caution-ink">
                A note on this document
              </h2>
              <p className="mt-2 text-ink">
                This policy accurately describes how the website and app handle your data.
                It has not been reviewed by a solicitor. If you are the business owner
                reading this: have it checked before you rely on it.
              </p>
            </section>
          </div>
        </div>
      </div>
    </article>
  );
}
