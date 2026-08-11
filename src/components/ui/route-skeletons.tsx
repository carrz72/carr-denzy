import { Skeleton } from "@/components/ui/states";

/**
 * Route-level loading skeletons.
 *
 * Every signed-in route reads from Supabase on the server. Without a Suspense
 * boundary, App Router navigation blocks until those queries finish: the user
 * taps, nothing happens for several hundred milliseconds, then the whole page
 * appears at once. That reads as a slow app even when the total time is
 * unremarkable — the problem is the silence, not the duration.
 *
 * A `loading.tsx` gives Next a boundary to stream the shell into immediately,
 * so the header and navigation paint on tap and only the data region waits.
 *
 * These are shaped like the content they replace, not spinners. A skeleton
 * that matches the layout also stops the page jumping when the real content
 * lands.
 */

export function PageHeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      </div>
      {withAction ? <Skeleton className="h-12 w-36 shrink-0" /> : null}
    </div>
  );
}

/** A list of cards — jobs, enquiries, invoices, quotes, customers. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-lg border border-line bg-surface-raised p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="mt-2.5 h-4 w-3/5" />
              <Skeleton className="mt-2 h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-24 shrink-0" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** The two-column detail layout used by every job, invoice and quote page. */
export function DetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:gap-8" role="status" aria-label="Loading">
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border border-line bg-surface-raised p-5 sm:p-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />

          <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex justify-between gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface-raised p-5 sm:p-6">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-4 h-28 w-full" />
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-line bg-surface-raised p-5 sm:p-6">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-4 h-11 w-full" />
            <Skeleton className="mt-2.5 h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The dashboard: four stat tiles above a two-column split. */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-line bg-surface-raised p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-8 w-20" />
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:gap-8">
        <div>
          <Skeleton className="h-7 w-48" />
          <div className="mt-4">
            <ListSkeleton rows={3} />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-line bg-surface-raised p-5 sm:p-6">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-4 h-16 w-full" />
              <Skeleton className="mt-2 h-16 w-full" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading</span>
    </div>
  );
}

/** A single centred form — settings, new job, builders. */
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="mx-auto max-w-3xl" role="status" aria-label="Loading">
      <div className="rounded-lg border border-line bg-surface-raised p-5 sm:p-6">
        {Array.from({ length: fields }).map((_, index) => (
          <div key={index} className={index === 0 ? "" : "mt-5"}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-12 w-full" />
          </div>
        ))}
        <Skeleton className="mt-7 h-12 w-40" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
