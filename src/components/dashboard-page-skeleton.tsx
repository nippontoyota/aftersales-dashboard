/** Instant fallback for the Suspense boundary each dashboard-family page
 * wraps its data-fetching content in (2026-09-01, at the user's request —
 * previously there was zero visual feedback during navigation; a click just
 * sat there frozen until the whole page, including the sidebar, finished
 * loading). AppShell now renders immediately from the fast admin/session
 * check alone — only this inner content area waits on the real (slower)
 * dashboard query, so the nav stays live and clickable the whole time. */
export function DashboardPageSkeleton({ heroCards = 0 }: { heroCards?: number }) {
  return (
    <div className="p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-3.5 w-72 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 animate-pulse rounded bg-slate-100" />
          <div className="h-8 w-28 animate-pulse rounded bg-slate-100" />
          <div className="h-8 w-8 animate-pulse rounded bg-slate-100" />
        </div>
      </div>

      {heroCards > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: heroCards }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-md border border-slate-200 bg-slate-100" />
        <div className="h-64 animate-pulse rounded-md border border-slate-200 bg-slate-100" />
      </div>

      <div className="mt-4 h-40 animate-pulse rounded-md border border-slate-200 bg-slate-100" />
    </div>
  );
}
