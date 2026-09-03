import Link from "next/link";
import { DateSelect } from "@/app/dashboard/date-select";
import { RegionSelect } from "@/app/dashboard/region-select";
import type { RegionName } from "@/lib/regions";
import { publishDashboardAction } from "@/lib/publish-actions";

/** Shared title + MTD subtitle + region/date selects + refresh + publish
 * control, used identically across Dashboard/Alerts/Branches/Reports/TKM
 * Targets so those pages can't drift out of sync on this chrome. */
export function DashboardPageHeader({
  title,
  basePath,
  date,
  region,
  dates,
  branchCount,
  hasPreviousUpload,
  previousDate,
  daysSincePrevious,
  showRegionSelect = true,
  isPublished,
  canPublish = false,
  extraParams,
  isCompanyScope = true,
}: {
  title: string;
  basePath: string;
  date: string;
  region: RegionName | "All";
  dates: string[];
  branchCount: number;
  hasPreviousUpload: boolean;
  previousDate: string | null;
  daysSincePrevious: number | null;
  showRegionSelect?: boolean;
  /** Whether `date` has been published to branch admins yet — omit entirely on a page that doesn't participate in the publish workflow. */
  isPublished?: boolean;
  /** Only HQ can publish — the control renders only when this is true. */
  canPublish?: boolean;
  /** Extra query params (e.g. /alerts' `watched=tkm`) that identify which
   * variant of the page this is — carried through the refresh link, the
   * publish redirect, and passed down to Date/RegionSelect, so switching
   * date/region or publishing doesn't silently drop back to a default
   * variant (found 2026-09-01, see alerts-panel.tsx's viewAllHref). */
  extraParams?: Record<string, string>;
  /** Whether the user has company-wide access for this date. If false, the view is locked to their own branch. */
  isCompanyScope?: boolean;
}) {
  const extraQuery = extraParams ? `&${new URLSearchParams(extraParams).toString()}` : "";
  const currentHref = `${basePath}?date=${date}${isCompanyScope && region !== "All" ? `&region=${region}` : ""}${extraQuery}`;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-fg">{title}</h1>
          {!isCompanyScope && (
            <span
              className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-fg-subtle"
              title="Unpublished view: showing only your branch"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                <path fillRule="evenodd" d="M8 2a3 3 0 0 0-3 3v2H4.5A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7H11V5a3 3 0 0 0-3-3zm-1 3a1 1 0 1 1 2 0v2H7V5z" clipRule="evenodd" />
              </svg>
              Unpublished
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-fg-subtle">
          MTD as of {date} · {branchCount} branch{branchCount === 1 ? "" : "es"}
          {region !== "All" ? ` in ${region}` : ""}
          {hasPreviousUpload
            ? ` · vs previous upload ${previousDate} (${daysSincePrevious} day${daysSincePrevious === 1 ? "" : "s"} ago)`
            : " · first upload"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {canPublish ? (
          isPublished ? (
            <span
              className="flex h-8 items-center gap-1 rounded border border-good/30 bg-good-soft px-2.5 text-xs font-medium text-good"
              title={`Branch admins can see the dashboard for ${date}`}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Published
            </span>
          ) : (
            <form action={publishDashboardAction}>
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="redirectTo" value={currentHref} />
              <button
                type="submit"
                title={`Make ${date}'s dashboard visible to branch admins`}
                className="h-8 rounded bg-accent px-3 text-xs font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
              >
                Publish {date}
              </button>
            </form>
          )
        ) : null}
        {showRegionSelect && isCompanyScope ? <RegionSelect selected={region} date={date} basePath={basePath} extraParams={extraParams} /> : null}
        <DateSelect dates={[...dates].reverse()} selected={date} region={region} basePath={basePath} extraParams={extraParams} />
        <Link
          href={currentHref}
          aria-label="Refresh"
          className="flex h-8 w-8 items-center justify-center rounded border border-border-strong text-fg-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
            <path d="M4 10a6 6 0 0 1 10.5-3.9M16 10a6 6 0 0 1-10.5 3.9" strokeLinecap="round" />
            <path d="M14 3v3.5h-3.5M6 17v-3.5h3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
