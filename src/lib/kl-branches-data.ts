import type { Report } from "./report";
import { branchName } from "./branch-names";
import { loadIncentiveSlabTargets } from "./incentive-slabs/store";
import { loadRegionRevenueTargets } from "./region-targets/store";
import { loadReportHolidaySet } from "./report-holidays/store";
import {
  branchAchieved,
  buildRegionTotals,
  metricBlock,
  sumOrNull,
  type RegionBranchRow,
  type RegionExtSalesBlock,
  type RegionRevenueView,
} from "./region-revenue-data";
import { sundayOffWorkingDaysElapsedInMonth, sundayOffWorkingDaysInMonth } from "./reporting-date";

/**
 * Branch Details data for the kl_cluster role (Biju S Pillai) — KL01A +
 * KL01B only, never the whole South region. One-off and hardcoded, same
 * pattern central-region-data.ts uses for Central's own branch list, rather
 * than a generic multi-branch mechanism (no other account needs this shape
 * yet). Reuses every helper region-revenue-data.ts already exports, with no
 * fold-in quirk to handle — unlike Central's CO01E, KL01B already carries
 * its own BPU figures and target row.
 */
export const KL_BRANCHES = ["KL01A", "KL01B"] as const;
export type KlBranchCode = (typeof KL_BRANCHES)[number];

export async function loadKlBranchesView(date: string, report: Report): Promise<RegionRevenueView> {
  const month = date.slice(0, 7);

  const [targets, slabs, holidays] = await Promise.all([
    loadRegionRevenueTargets(month, KL_BRANCHES),
    loadIncentiveSlabTargets(month),
    loadReportHolidaySet(),
  ]);

  const elapsed = sundayOffWorkingDaysElapsedInMonth(date, holidays);
  const total = sundayOffWorkingDaysInMonth(date, holidays);
  const workingDays = { elapsed, total, remaining: Math.max(0, total - elapsed) };

  const byBranch = new Map(report.branches.map((b) => [b.branch, b]));

  const branches: RegionBranchRow[] = KL_BRANCHES.map((branch) => {
    const b = byBranch.get(branch);
    const t = targets.get(branch);
    const achieved = branchAchieved(b);

    const gs = metricBlock(t?.gsTarget ?? null, achieved.gs, elapsed, total);
    const bp = metricBlock(t?.bpTarget ?? null, achieved.bp, elapsed, total);
    const extBase = metricBlock(t?.extTarget ?? null, achieved.ext, elapsed, total);
    const ext: RegionExtSalesBlock = { ...extBase, sprExternalReference: achieved.sprExternal };

    const totalAchieved = sumOrNull([gs.achieved, bp.achieved, ext.achieved]);
    const totalRevenue = totalAchieved !== null ? totalAchieved + achieved.scrapAndUsedOil : null;

    return {
      branch,
      label: branchName(branch),
      gs,
      bp,
      ext,
      totalMonthlyTarget: sumOrNull([gs.target, bp.target, ext.target]),
      totalAchieved,
      scrapAndUsedOil: achieved.scrapAndUsedOil,
      totalRevenue,
      tgloss: achieved.tgloss,
      badge: branch === "KL01B" ? "Body & Paint only" : undefined,
      slab: slabs.get(branch),
      slabActual: totalRevenue,
    };
  });

  const { totals, slab4Total, balanceToSlab4, regionSlab, uploadStatus } = buildRegionTotals(branches, KL_BRANCHES, byBranch, elapsed, total);

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
