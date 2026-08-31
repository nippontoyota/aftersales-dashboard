import { computeKpiSummary, filterBranchesByRegion, type KpiSummary } from "./aggregate";
import type { AdminAccount } from "./admin-store";
import { buildReport, type Report } from "./report";
import { REGIONS, type RegionName } from "./regions";
import { listSnapshotDates, loadSnapshotsForMonthUpTo, type Snapshot } from "./snapshot-store";
import { loadAllServiceInfoSnapshotsForMonthUpTo, type ServiceInfoSnapshot } from "./service-info/store";
import { isDatePublished, listPublishedDates } from "./publish-store";

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
};

export async function loadDashboardData(searchParams: { date?: string; region?: string }, admin: AdminAccount): Promise<DashboardData | null> {
  const isHq = admin.role === "hq";
  const allDates = await listSnapshotDates();
  if (allDates.length === 0) return null;

  let dates: string[];
  let date: string;

  if (isHq) {
    // HQ always sees every date, published or not — they're the ones deciding when to publish.
    dates = allDates;
    date = searchParams.date && dates.includes(searchParams.date) ? searchParams.date : dates.at(-1)!;
  } else {
    // A branch admin can only ever land on a published date — falls back to
    // the latest published one (yesterday's dashboard, most likely) when
    // none is requested, or when the requested one isn't published yet.
    // This is the real access boundary: a page must never fall back to
    // `allDates`/`report.branches` unfiltered by this, or the gate does
    // nothing.
    dates = await listPublishedDates();
    if (dates.length === 0) return null;
    date = searchParams.date && dates.includes(searchParams.date) ? searchParams.date : dates.at(-1)!;
  }

  const region: RegionName | "All" = searchParams.region && searchParams.region in REGIONS ? (searchParams.region as RegionName) : "All";

  const [report, monthSnapshots, serviceInfoMonthSnapshots, isPublished] = await Promise.all([
    buildReport(date),
    loadSnapshotsForMonthUpTo(date),
    loadAllServiceInfoSnapshotsForMonthUpTo(date),
    isDatePublished(date),
  ]);
  const filteredBranches = report ? filterBranchesByRegion(report.branches, region) : [];
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
    currentHrefBase: `date=${date}${region !== "All" ? `&region=${region}` : ""}`,
    isCompanyScope: true,
    isPublished,
    canPublish: isHq,
  };
}
