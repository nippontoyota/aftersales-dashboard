import { computeKpiSummary, filterBranchesByRegion, type KpiSummary } from "./aggregate";
import type { AdminAccount } from "./admin-store";
import { loadBillTotalsByMonth, type BillMonthTotal } from "./bill/store";
import { buildReport, type Report } from "./report";
import { REGIONS, type RegionName } from "./regions";
import { listSnapshotDates, loadSnapshotsForMonthUpTo, type Snapshot } from "./snapshot-store";
import { loadAllServiceInfoSnapshotsForMonthUpTo, type ServiceInfoSnapshot } from "./service-info/store";
import { isDatePublished } from "./publish-store";

/** Nav-shell state for the dashboard family of pages — cheap enough to run in
 * the fast outer shell (before the Suspense'd content). A branch or regional
 * admin whose latest uploaded date isn't published yet is in raw-report mode:
 * the /dashboard nav item is relabelled and the company-wide tabs (Reports,
 * TKM Targets, Alerts, Branches) are hidden. Regional admins never see the
 * Upload tab. HQ is never restricted. */
export async function loadNavState(
  admin: AdminAccount,
): Promise<{ companyTabs: boolean; dashboardLabel: string; canUpload: boolean }> {
  const canUpload = admin.role !== "regional";
  if (admin.role === "hq") return { companyTabs: true, dashboardLabel: "Dashboard", canUpload };
  const dates = await listSnapshotDates();
  const latest = dates.at(-1);
  const latestPublished = latest ? await isDatePublished(latest) : true;
  return {
    companyTabs: latestPublished,
    dashboardLabel: latestPublished ? "Dashboard" : admin.role === "regional" ? "Regional Report" : "Daily Report",
    canUpload,
  };
}

/** Resolves date/region from searchParams and loads everything the
 * Dashboard, Alerts, Branches, Reports, and TKM Targets pages all need in
 * common — centralized so those pages can't quietly drift out of sync on
 * how "the current scope" is determined. Page-specific data (trend series,
 * heatmap, etc.) stays in each page, this is just the shared foundation.
 *
 * Branch admins see the full company-wide dashboard, identical to HQ's own
 * view — no branch lock, no region lock (2026-08-31, reversing the
 * 2026-08-29 "locked to own branch" decision at the user's explicit
 * request) — gated only by *which date* they're allowed to look at: HQ is
 * never gated (they need to review a date before publishing it), a branch
 * admin can only ever land on a *published* date (see publish-store.ts).
 * `isCompanyScope` is consequently always `true` now; kept as a field
 * (rather than removed) so it can act as a single switch if a
 * branch-locked view is ever wanted again, without threading a new prop
 * through every page. */
export type DashboardData = {
  date: string;
  region: RegionName | "All";
  dates: string[];
  report: Report | null;
  filteredBranches: Report["branches"];
  kpis: KpiSummary;
  hasPreviousUpload: boolean;
  monthSnapshots: Snapshot[];
  /** Every branch's Service Info Report snapshots this month, up to `date` — for the VAS Bill trend line (see trend.ts's computeVasTrendSeries), which needs day-by-day Service Info data no other page-level fetch already loads. */
  serviceInfoMonthSnapshots: ServiceInfoSnapshot[];
  currentHrefBase: string;
  isCompanyScope: boolean;
  /** Whether `date` has been published — always true for whatever a branch admin is looking at (they can't reach an unpublished date at all); meaningful for HQ, who can view and publish the same date. */
  isPublished: boolean;
  /** Only HQ can publish — drives whether the Publish control renders at all. */
  canPublish: boolean;
  billTotals: BillMonthTotal[];
  /** For a branch admin, true when the current `date` is not published yet —
   * they get the raw single-branch "Daily Report" instead of the company
   * dashboard. Always false for HQ. */
  showBranchDailyReport: boolean;
  /** For a regional manager, true when the current `date` is not published
   * yet — they get the raw region-wide comparison table (their branches +
   * a region total) instead of the company dashboard. Always false for HQ
   * and branch admins. */
  showRegionDailyReport: boolean;
  /** Whether the company-wide tabs (Reports, TKM Targets, Alerts, Branches)
   * are available. HQ: always. Branch/regional admin: only once the latest
   * uploaded date has been published. */
  showCompanyTabs: boolean;
};

export async function loadDashboardData(searchParams: { date?: string; region?: string }, admin: AdminAccount): Promise<DashboardData | null> {
  const isHq = admin.role === "hq";
  const allDates = await listSnapshotDates();
  if (allDates.length === 0) return null;

  // Everyone sees all dates — HQ to review/publish, branch admins to view their
  // own restricted dashboard (only their branch) or the full published dashboard.
  const dates = allDates;
  const date = searchParams.date && dates.includes(searchParams.date) ? searchParams.date : dates.at(-1)!;

  const latestDate = allDates.at(-1)!;
  const billBranch = admin.role === "branch" ? admin.branch : undefined;
  const [report, monthSnapshots, serviceInfoMonthSnapshots, isPublished, billTotals, latestPublished] = await Promise.all([
    buildReport(date),
    loadSnapshotsForMonthUpTo(date),
    loadAllServiceInfoSnapshotsForMonthUpTo(date),
    isDatePublished(date),
    loadBillTotalsByMonth(billBranch),
    date === latestDate ? Promise.resolve(null) : isDatePublished(latestDate),
  ]);

  const isLatestPublished = latestPublished ?? isPublished;
  const isCompanyScope = isHq || isPublished;
  const showBranchDailyReport = admin.role === "branch" && !isPublished;
  const showRegionDailyReport = admin.role === "regional" && !isPublished;
  const showCompanyTabs = isHq || isLatestPublished;

  // Region: a regional manager is locked to their own region until the date
  // is published; after that (isCompanyScope) they can switch like HQ, but
  // still default to their own region when no explicit choice is made.
  const requestedRegion =
    searchParams.region && searchParams.region in REGIONS ? (searchParams.region as RegionName) : null;
  let region: RegionName | "All";
  if (admin.role === "regional" && !isCompanyScope) {
    region = admin.region;
  } else if (isCompanyScope) {
    region = requestedRegion ?? (admin.role === "regional" ? admin.region : "All");
  } else {
    region = "All";
  }

  let filteredBranches = report ? filterBranchesByRegion(report.branches, region) : [];
  if (!isCompanyScope && admin.role === "branch") {
    filteredBranches = filteredBranches.filter((b) => b.branch === admin.branch);
  }

  const kpis = computeKpiSummary(filteredBranches);
  const hasPreviousUpload = report?.hasPreviousSnapshot ?? false;

  return {
    date,
    region,
    dates,
    report,
    filteredBranches,
    kpis,
    hasPreviousUpload,
    monthSnapshots,
    serviceInfoMonthSnapshots,
    currentHrefBase: `date=${date}${isCompanyScope && region !== "All" ? `&region=${region}` : ""}`,
    isCompanyScope,
    isPublished,
    canPublish: isHq,
    billTotals,
    showBranchDailyReport,
    showRegionDailyReport,
    showCompanyTabs,
  };
}
