import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr";
import type { GoogleReview, GoogleReviewSummary } from "@/lib/google-reviews";
import { business } from "@/lib/site";
import { cn } from "@/lib/cn";
import { ReviewText } from "./review-text";

function Stars({ rating, className }: { rating: number; className?: string }) {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span
      className={cn("tracking-[0.12em] text-[#e0a100]", className)}
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {"★".repeat(rounded)}
      <span className="text-line">{"★".repeat(5 - rounded)}</span>
    </span>
  );
}

function ReviewCard({ review }: { review: GoogleReview }) {
  return (
    <figure className="m-0 flex flex-col gap-3 rounded-xl border border-line bg-surface-raised p-6 shadow-subtle">
      <div className="flex items-center justify-between gap-3">
        <Stars rating={review.rating} />
        {review.when ? <span className="text-sm text-ink-subtle">{review.when}</span> : null}
      </div>
      <div className="text-ink">
        <ReviewText text={review.text} />
      </div>
      <figcaption className="mt-auto font-medium text-ink-muted">
        {review.authorUrl ? (
          <a href={review.authorUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {review.author}
          </a>
        ) : (
          review.author
        )}
        <span className="font-normal text-ink-subtle"> · on Google</span>
      </figcaption>
    </figure>
  );
}

/**
 * Google reviews, shown as written and attributed to Google (their terms).
 * Renders nothing at all until the Places API is set up and returns at least
 * one review, so the home page never shows an empty box.
 */
export function GoogleReviewsSection({ summary }: { summary: GoogleReviewSummary | null }) {
  const reviews = summary?.reviews ?? [];
  if (!summary || reviews.length === 0) return null;

  return (
    <section className="section-y" aria-labelledby="reviews-heading">
      <div className="container-page">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <h2 id="reviews-heading" className="font-display text-title text-ink">
              What customers say
            </h2>
            {summary.count > 0 ? (
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-muted">
                <span className="font-display text-subheading text-ink">{summary.rating.toFixed(1)}</span>
                <Stars rating={summary.rating} className="text-lg" />
                <span>
                  from {summary.count} Google review{summary.count === 1 ? "" : "s"}
                </span>
              </p>
            ) : null}
          </div>

          <a
            href={business.googleReviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 font-medium text-accent underline-offset-4 hover:underline"
          >
            Leave us a review
            <ArrowSquareOutIcon size={16} aria-hidden="true" />
          </a>
        </div>

        <div className="reveal mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {reviews.slice(0, 3).map((review, index) => (
            <ReviewCard key={`${review.author}-${index}`} review={review} />
          ))}
        </div>

        <p className="mt-4 text-sm text-ink-subtle">Reviews from Google, shown as written.</p>
      </div>
    </section>
  );
}
