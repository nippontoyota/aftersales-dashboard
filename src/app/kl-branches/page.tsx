import { Suspense } from "react";
import { adminIdentityLabel } from "@/lib/admin-store";
import { aggregateCloseSaRows, mergeRepeatJobCounts, type CloseSaPeriodTotals } from "@/lib/close-sa-analytics/aggregate";
import { findRepeatJobs, repeatJobCountsBySa } from "@/lib/close-sa-analytics/repeat-jobs";
import { loadCloseSaAnalyticsForBranch } from "@/lib/close-sa-analytics/store";
import { listAccessoriesStaffNamesForBranch } from "@/lib/accessories-staff-store";
import { loadCentralMetricTargetsView } from "@/lib/central-metric-targets/view-data";
import { loadBillTotalsByMonth } from "@/lib/bill/store";
import { loadCancellationKpis } from "@/lib/cancellation/store";
import { reconcileCancellations } from "@/lib/cancellation/reconcile";
import { formatCompactCurrency } from "@/lib/format";
import { branchName } from "@/lib/branch-names";
import { KL_BRANCHES, loadKlBranchesView } from "@/lib/kl-branches-data";
import { buildReport, type BranchReport } from "@/lib/report";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";
import { isDatePublished } from "@/lib/publish-store";
import { latestNonHolidayDate } from "@/lib/reporting-date";
import { listSnapshotDates } from "@/lib/snapshot-store";
import { eyebrow } from "@/lib/ui";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { RegionRevenueDashboard } from "../dashboard/region-revenue-dashboard";
import { TkmTargetsSection } from "../dashboard/central/tkm-targets-section";
import { BillsPageClient } from "../bills/bills-page-client";
import { requireKlBranchesAccess } from "./kl-branches-guard";
import { KlBranchesShell } from "./kl-branches-shell";
import { KlBranchesSaTabs } from "./kl-branches-sa-tabs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function KlBranchesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const admin = await requireKlBranchesAccess();
  const identity = adminIdentityLabel(admin);

  return (
    <KlBranchesShell identity={identity}>
      <Suspense fallback={<DashboardPageSkeleton heroCards={5} />}>
        <KlBranchesContent searchParams={searchParams} />
      </Suspense>
    </KlBranchesShell>
  );
}

async function KlBranchesContent({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const [allDates, holidaySet] = await Promise.all([listSnapshotDates(), loadReportHolidaySet()]);

  if (allDates.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <h1 className="text-lg font-semibold text-fg">Kollam Branches</h1>
        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet — check back once HQ uploads a day&apos;s data.
        </div>
      </div>
    );
  }

  const date = params.date && DATE_RE.test(params.date) ? params.date : latestNonHolidayDate(allDates, holidaySet)!;
  const month = date.slice(0, 7);
  const monthStart = `${month}-01`;

  const [report, isPublished] = await Promise.all([buildReport(date), isDatePublished(date)]);

  if (!report) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <h1 className="text-lg font-semibold text-fg">Kollam Branches</h1>
        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          No BA Tool report on file for {date}.
        </div>
      </div>
    );
  }

  const klBranchReports = KL_BRANCHES.map((code) => report.branches.find((b) => b.branch === code)).filter(
    (b): b is BranchReport => b !== undefined,
  );

  const [view, saByBranch, kpis, flaggedByBranch, billMonths] = await Promise.all([
    loadKlBranchesView(date, report),
    Promise.all(
      KL_BRANCHES.map(async (branch) => {
        const [rows, accessoriesStaffNames, repeatFlags] = await Promise.all([
          loadCloseSaAnalyticsForBranch(branch, monthStart, date),
          listAccessoriesStaffNamesForBranch(branch),
          findRepeatJobs(branch, monthStart, date),
        ]);
        const totals = aggregateCloseSaRows(rows);
        mergeRepeatJobCounts(totals, repeatJobCountsBySa(repeatFlags));
        return { branch, totals, accessoriesStaffNames };
      }),
    ),
    loadCancellationKpis(month, [...KL_BRANCHES]),
    Promise.all(KL_BRANCHES.map((branch) => reconcileCancellations(month, branch))),
    loadBillTotalsByMonth([...KL_BRANCHES]),
  ]);

  const metrics = await loadCentralMetricTargetsView(klBranchReports, date, holidaySet);
  const branchLabels = Object.fromEntries(KL_BRANCHES.map((code) => [code, branchName(code)]));

  const totalsByBranch: Record<string, CloseSaPeriodTotals[]> = {};
  const accessoriesStaffNamesByBranch = new Map<string, string[]>();
  for (const { branch, totals, accessoriesStaffNames } of saByBranch) {
    totalsByBranch[branch] = totals;
    accessoriesStaffNamesByBranch.set(branch, accessoriesStaffNames);
  }

  const kpiByBranch = new Map(kpis.map((k) => [k.branch, k]));
  const flaggedCountByBranch = new Map(
    KL_BRANCHES.map((branch, i) => [branch, flaggedByBranch[i].rows.filter((r) => r.flagged && r.branch === branch).length]),
  );

  return (
    <div>
      <RegionRevenueDashboard
        view={view}
        regionName="Kollam"
        dates={allDates}
        uploadedAt={report.uploadedAt}
        isPublished={isPublished}
        branchReports={klBranchReports}
        daysSincePrevious={report.daysSincePrevious}
        basePath="/kl-branches"
      />

      <div className="mx-auto max-w-[1500px] px-6">
        <div className="mt-8">
          <h2 className="text-base font-semibold text-fg">TKM Targets</h2>
          <p className="mt-1 text-xs text-fg-faint">BPU, Offtake, SPR Internal, SPR External, PM+OC, Battery, Tyre — MTD and year pace.</p>
          <div className="mt-3">
            <TkmTargetsSection metrics={metrics} branchLabels={branchLabels} />
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-base font-semibold text-fg">SA-wise Details</h2>
          <p className="mt-1 text-xs text-fg-faint">GS/BP/Accessories/PDI split, month-to-date for {date}.</p>
          <div className="mt-3">
            <KlBranchesSaTabs
              branches={KL_BRANCHES}
              totalsByBranch={totalsByBranch}
              accessoriesStaffNamesByBranch={accessoriesStaffNamesByBranch}
              subtitlePrefix={`Month-to-date for ${date}`}
            />
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-base font-semibold text-fg">Cancellations</h2>
          <p className="mt-1 text-xs text-fg-faint">Tax invoice cancellations this month. A control view — read-only.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {KL_BRANCHES.map((branch) => {
              const k = kpiByBranch.get(branch);
              const flaggedCount = flaggedCountByBranch.get(branch) ?? 0;
              return (
                <div key={branch} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                  <div className={eyebrow}>{branchName(branch)}</div>
                  <div className="mt-1 text-[11px] text-fg-faint">{branch}</div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-semibold text-fg">{k?.count ?? 0}</div>
                      <div className="text-[10px] text-fg-faint">Cancelled</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-fg">{formatCompactCurrency(k?.beforeTaxTotal ?? 0)}</div>
                      <div className="text-[10px] text-fg-faint">Value</div>
                    </div>
                    <div>
                      <div className={`text-lg font-semibold ${flaggedCount > 0 ? "text-bad" : "text-good"}`}>{flaggedCount}</div>
                      <div className="text-[10px] text-fg-faint">Flagged</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 mb-10">
          <h2 className="text-base font-semibold text-fg">Bills &amp; Scrap / Used-Oil Revenue</h2>
          <p className="mt-1 text-xs text-fg-faint">Folds into Total Revenue above.</p>
          <div className="mt-3">
            {billMonths.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
                No bills have been uploaded yet.
              </div>
            ) : (
              <BillsPageClient months={billMonths} initialMonth={billMonths[0]?.month} showBranchColumn />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
