import { aggregateCloseSaRows, mergeRepeatJobCounts } from "@/lib/close-sa-analytics/aggregate";
import { findRepeatJobs, repeatJobCountsBySa } from "@/lib/close-sa-analytics/repeat-jobs";
import { loadCloseSaAnalyticsForBranch } from "@/lib/close-sa-analytics/store";
import { listAccessoriesStaffNamesForBranch } from "@/lib/accessories-staff-store";
import { SaAnalyticsSections } from "@/components/sa-analytics-sections";
import { SaBranchSelect } from "@/components/sa-branch-select";
import { buildReport } from "@/lib/report";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";
import { latestNonHolidayDate } from "@/lib/reporting-date";
import { REGIONS, type RegionName } from "@/lib/regions";
import { listSnapshotDates } from "@/lib/snapshot-store";
import { DateSelect } from "./date-select";
import { RevenuePerVehicleTable } from "./revenue-per-vehicle-table";

/**
 * SA Analytics for a regional manager — the same GS/BP/Accessories/PDI
 * breakdown HQ sees on /branches, scoped to just this region's own branches,
 * with the same "all branches in my region, or pick one" filter (2026-10-26,
 * at the RMs' request). Shared by both /dashboard/central/sa-analytics and
 * /dashboard/region/sa-analytics (their own guards + AppShell nav, identical
 * content otherwise — no Central quirk applies here, unlike TKM Targets'
 * metric-target fallback logic, since SA Analytics reads real per-RO data
 * straight off each branch, unaffected by any revenue-stream folding).
 */
export async function RegionSaAnalyticsContent({
  region,
  searchParams,
  basePath,
}: {
  region: RegionName;
  searchParams: Promise<{ date?: string; saBranch?: string }>;
  basePath: string;
}) {
  const params = await searchParams;
  const [dates, holidaySet] = await Promise.all([listSnapshotDates(), loadReportHolidaySet()]);

  if (dates.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <h1 className="text-lg font-semibold text-fg">SA Analytics</h1>
        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet — check back once HQ uploads a day&apos;s data.
        </div>
      </div>
    );
  }

  const date = params.date && dates.includes(params.date) ? params.date : latestNonHolidayDate(dates, holidaySet)!;
  const report = await buildReport(date);

  if (!report) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <h1 className="text-lg font-semibold text-fg">SA Analytics</h1>
        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          No BA Tool report on file for {date}.
        </div>
      </div>
    );
  }

  // Real branches on file today, not just REGIONS[region] — excludes CO01C
  // (Central's online-store channel, folded into CO01A, never its own row in
  // report.branches), same source HQ's own branch dropdown uses.
  const regionBranchCodes = report.branches.map((b) => b.branch).filter((code) => (REGIONS[region] as readonly string[]).includes(code));
  const regionBranches = report.branches.filter((b) => regionBranchCodes.includes(b.branch));
  const monthStart = `${date.slice(0, 7)}-01`;

  const [perBranchRows, perBranchAccessoriesStaff] = await Promise.all([
    Promise.all(regionBranchCodes.map((b) => loadCloseSaAnalyticsForBranch(b, monthStart, date))),
    Promise.all(regionBranchCodes.map((b) => listAccessoriesStaffNamesForBranch(b))),
  ]);
  const closeSaTotalsAll = aggregateCloseSaRows(perBranchRows.flat());
  const accessoriesStaffNamesByBranch = new Map<string, string[]>(regionBranchCodes.map((b, i) => [b, perBranchAccessoriesStaff[i]]));

  const saBranch = params.saBranch && params.saBranch !== "All" && regionBranchCodes.includes(params.saBranch) ? params.saBranch : null;
  const closeSaTotals = saBranch ? closeSaTotalsAll.filter((t) => t.branches[0] === saBranch) : closeSaTotalsAll;

  // Same Car Same Work Repeat is a live cross-date check, not part of the
  // daily snapshot (see repeat-jobs.ts) — one query per branch actually
  // displayed (post-filter), same pattern as /branches.
  const branchesInvolved = [...new Set(closeSaTotals.flatMap((t) => t.branches))];
  const repeatFlagsByBranch = await Promise.all(branchesInvolved.map((b) => findRepeatJobs(b, monthStart, date)));
  const repeatCounts = repeatJobCountsBySa(repeatFlagsByBranch.flat());
  mergeRepeatJobCounts(closeSaTotals, repeatCounts);

  return (
    <div className="mx-auto max-w-[1500px] p-6">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">SA Analytics — {region}</h1>
          <p className="mt-1 text-xs text-fg-faint">
            Month-to-date for {date}, {saBranch ?? `all of ${region}`}.
          </p>
        </div>
        <DateSelect dates={dates} selected={date} region="All" basePath={basePath} extraParams={saBranch ? { saBranch } : undefined} />
      </div>

      <div className="mt-4">
        <RevenuePerVehicleTable branches={regionBranches} variant="compact" totalRowLabel={`${region} Rgn`} />
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 text-xs text-fg-subtle">
        <span>Branch:</span>
        <SaBranchSelect selected={saBranch ?? "All"} date={date} basePath={basePath} branches={regionBranchCodes} />
      </div>

      <div className="mt-4">
        <SaAnalyticsSections
          totals={closeSaTotals}
          accessoriesStaffNamesByBranch={accessoriesStaffNamesByBranch}
          showBranch={!saBranch}
          subtitlePrefix={`Month-to-date for ${date}, ${saBranch ?? region}`}
        />
      </div>
    </div>
  );
}
