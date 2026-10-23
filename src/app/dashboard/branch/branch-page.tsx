import type { BranchView } from "@/lib/branch-view-data";
import type { CloseSaPeriodTotals } from "@/lib/close-sa-analytics/aggregate";
import type { IncentiveSlabTargets } from "@/lib/incentive-slabs/store";
import { CloseSaAnalyticsTable } from "@/components/close-sa-analytics-table";
import { DateSelect } from "../date-select";
import { IncentiveSlabIndicator } from "../incentive-slab-indicator";
import { BranchOverviewBody } from "./branch-overview-body";

function asOf(uploadedAt: string): string {
  return new Date(uploadedAt).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function Header({ title, sub, date, dates }: { title: string; sub: string; date: string; dates: string[] }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        <p className="mt-1 text-xs text-fg-faint">{sub}</p>
      </div>
      <DateSelect dates={dates} selected={date} region="All" />
    </div>
  );
}

export function BranchAccountPage({
  view,
  branch,
  date,
  dates,
  uploadedAt,
  incentiveSlabs,
  holidays,
  closeSaTotals,
  canDownloadRevenueStream,
}: {
  view: BranchView | null;
  branch: string;
  date: string;
  dates: string[];
  uploadedAt: string;
  /** Undefined when no target is uploaded for this branch this month —
   * IncentiveSlabIndicator shows a muted placeholder rather than hiding
   * (2026-09-25, at the user's request: every branch should be able to see
   * their own slab progress on their own dashboard). */
  incentiveSlabs?: IncentiveSlabTargets;
  /** HQ-flagged report_holidays, for the Incentive Slab forecast (2026-09-29). */
  holidays?: string[];
  /** Month-to-date, this branch's own Close SAs only (2026-10-22) — see
   * close-sa-analytics/. */
  closeSaTotals: CloseSaPeriodTotals[];
  /** True only when `date` is today's own report date — the Revenue Stream
   * download is otherwise unreachable here, since this component only ever
   * renders once that date is published (showBranchDailyReport handles the
   * pre-publish case) — see dashboard/page.tsx. The API route itself also
   * re-checks today+published independently, so this prop only controls
   * whether the button is shown, never whether the download is allowed
   * (2026-10-23, at the user's request: every branch should get the same
   * company-wide Revenue Stream file HQ downloads, once HQ publishes the
   * day). */
  canDownloadRevenueStream: boolean;
}) {
  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <Header
        title={`${branch} — Branch Overview`}
        sub={`Month-to-date for ${date}. Data as of ${asOf(uploadedAt)} IST.`}
        date={date}
        dates={dates}
      />
      {canDownloadRevenueStream && (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-fg-muted">
            Today&apos;s Revenue Stream workbook is ready — the same company-wide file HQ downloads, every branch side
            by side.
          </div>
          <a
            href="/api/hq/revenue-stream-export"
            className="inline-flex items-center gap-1.5 self-start rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg sm:self-auto"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M8 2v8m0 0-3-3m3 3 3-3M3 13h10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Download Excel ({date})
          </a>
        </div>
      )}
      <div className="mt-4 flex justify-center rounded-lg border border-border bg-surface p-4 shadow-card sm:justify-start">
        <IncentiveSlabIndicator scopeLabel={branch} actual={view?.totalRevenueMtd ?? null} slabs={incentiveSlabs} date={date} holidays={holidays} size={108} />
      </div>
      <div className="mt-4">
        {view ? (
          <BranchOverviewBody view={view} date={date} />
        ) : (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
            No data for {branch} on {date} yet.
          </div>
        )}
      </div>
      <div className="mt-4">
        <CloseSaAnalyticsTable totals={closeSaTotals} subtitle={`Month-to-date for ${date} — Service Info + Labour Sales + Part Sale, per Close SA`} />
      </div>
    </div>
  );
}
