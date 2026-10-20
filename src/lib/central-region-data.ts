import type { Report, BranchReport } from "./report";
import { loadIncentiveSlabTargets } from "./incentive-slabs/store";
import { loadRegionRevenueTargets, type RegionRevenueTargets } from "./region-targets/store";
import { loadReportHolidaySet } from "./report-holidays/store";
import {
  addAchieved,
  branchAchieved,
  buildRegionTotals,
  metricBlock,
  sumOrNull,
  totalRevenueStream,
  type RegionBranchRow,
  type RegionExtSalesBlock,
  type RegionMetricBlock,
  type RegionMetricStatus,
  type RegionRevenueView,
} from "./region-revenue-data";
import { sundayOffWorkingDaysElapsedInMonth, sundayOffWorkingDaysInMonth } from "./reporting-date";

/**
 * Data for the Central regional manager's own dashboard layout (built
 * 2026-09-24 to replace his personal Excel tracker — see the conversation
 * for the full trace of which figure maps to which formula in his sheet).
 * Generalized 2026-10-20 into region-revenue-data.ts so South and North get
 * the identical layout on their own branches — this file now only carries
 * what's actually unique to Central: CO01E's fold-in before it gets its own
 * target column, and the branch order/labels his tracker uses.
 */

/** CO01E (a Body & Paint-only satellite, run out of Tower/CO01B) gets its
 * own column starting this month — before it, ALL of its revenue (GS/BP/Ext
 * Sales, not just the Slab comparison) is folded into CO01B's own figures,
 * since September's targets were set with CO01E's contribution already
 * assumed inside CO01B's target (confirmed with the user 2026-09-25). */
const CO01E_SPLIT_MONTH = "2026-10";

/** Column order — CO01E sits right after Tower/CO01B, where it's folded
 * from, once it's split out. CO01C (online store) already folds into
 * CO01A's own figures elsewhere in report.ts and stays out of this view
 * entirely, unlike CO01E. */
const CENTRAL_BRANCH_ORDER = ["CO01A", "CO01B", "CO01E", "MV01A", "KY01A"] as const;

type CentralBranchCode = (typeof CENTRAL_BRANCH_ORDER)[number];

/** Display names as used in his tracker. No real name for CO01E exists
 * anywhere in the app yet, so it's shown as its branch code, same as every
 * other place in the app that doesn't have a name mapping. */
export const CENTRAL_BRANCH_LABELS: Record<CentralBranchCode, string> = {
  CO01A: "Nettoor",
  CO01B: "Tower",
  CO01E: "CO01E",
  MV01A: "Muvattupuzha",
  KY01A: "Kayamkulam",
};

export function centralBranchesForMonth(month: string): CentralBranchCode[] {
  return month >= CO01E_SPLIT_MONTH ? [...CENTRAL_BRANCH_ORDER] : CENTRAL_BRANCH_ORDER.filter((b) => b !== "CO01E");
}

// Re-exported under their old names — every other file in the app still
// imports these from here.
export type CentralMetricStatus = RegionMetricStatus;
export type CentralMetricBlock = RegionMetricBlock;
export type CentralExtSalesBlock = RegionExtSalesBlock;
export type CentralBranchRow = RegionBranchRow;
export type CentralRegionView = RegionRevenueView;

export async function loadCentralRegionView(date: string, report: Report): Promise<CentralRegionView> {
  const month = date.slice(0, 7);
  const displayedBranches = centralBranchesForMonth(month);
  const co01eIsSplit = displayedBranches.includes("CO01E");

  const [targets, slabs, holidays] = await Promise.all([
    loadRegionRevenueTargets(month, displayedBranches),
    loadIncentiveSlabTargets(month),
    loadReportHolidaySet(),
  ]);

  const elapsed = sundayOffWorkingDaysElapsedInMonth(date, holidays);
  const total = sundayOffWorkingDaysInMonth(date, holidays);
  const workingDays = { elapsed, total, remaining: Math.max(0, total - elapsed) };

  const byBranch = new Map(report.branches.map((b) => [b.branch, b]));

  const branches: CentralBranchRow[] = displayedBranches.map((branch) => {
    const b: BranchReport | undefined = byBranch.get(branch);
    const t: RegionRevenueTargets | undefined = targets.get(branch);

    const includesCo01e = branch === "CO01B" && !co01eIsSplit;
    const achieved = includesCo01e ? addAchieved(branchAchieved(b), branchAchieved(byBranch.get("CO01E"))) : branchAchieved(b);

    const gs = metricBlock(t?.gsTarget ?? null, achieved.gs, elapsed, total);
    const bp = metricBlock(t?.bpTarget ?? null, achieved.bp, elapsed, total);
    const extBase = metricBlock(t?.extTarget ?? null, achieved.ext, elapsed, total);
    const ext: CentralExtSalesBlock = { ...extBase, sprExternalReference: achieved.sprExternal };

    const totalAchieved = sumOrNull([gs.achieved, bp.achieved, ext.achieved]);
    const totalRevenue = totalAchieved !== null ? totalAchieved + achieved.scrapAndUsedOil : null;

    // CO01B's Slab target still lumps in CO01E's share even after the Oct
    // revenue split (see slabActual's own comment) — fold CO01E's full
    // revenue stream back in for the comparison, on top of whatever's
    // already folded in by the pre-split includesCo01e branch above.
    const slabActual =
      branch === "CO01B" && co01eIsSplit ? sumOrNull([totalRevenue, totalRevenueStream(branchAchieved(byBranch.get("CO01E")))]) : totalRevenue;

    return {
      branch,
      label: CENTRAL_BRANCH_LABELS[branch],
      gs,
      bp,
      ext,
      totalMonthlyTarget: sumOrNull([gs.target, bp.target, ext.target]),
      totalAchieved,
      scrapAndUsedOil: achieved.scrapAndUsedOil,
      totalRevenue,
      badge: includesCo01e ? "Includes CO01E" : undefined,
      slab: slabs.get(branch),
      slabActual,
    };
  });

  const { totals, slab4Total, balanceToSlab4, regionSlab, uploadStatus } = buildRegionTotals(
    branches,
    displayedBranches,
    byBranch,
    elapsed,
    total,
  );

  return {
    date,
    branches,
    totals,
    slab4Total,
    balanceToSlab4,
    regionSlab,
    workingDays,
    holidays: [...holidays],
    uploadStatus,
  };
}
