import type { Report, BranchReport } from "./report";
import { BODY_PAINT_ONLY_BRANCHES } from "./report";
import { branchName } from "./branch-names";
import { loadIncentiveSlabTargets, type IncentiveSlabTargets } from "./incentive-slabs/store";
import { loadRegionRevenueTargets, type RegionRevenueTargets } from "./region-targets/store";
import { loadReportHolidaySet } from "./report-holidays/store";
import { REGIONS, type RegionName } from "./regions";
import { sundayOffWorkingDaysElapsedInMonth, sundayOffWorkingDaysInMonth } from "./reporting-date";

/**
 * Shared GS/BP/Ext Sales revenue-tracking data for a regional manager's own
 * dashboard — originally built just for Central (see central-region-data.ts's
 * module comment for the full history), generalized 2026-10-20 so South and
 * North get the identical layout on their own branches. Central keeps its
 * own loader (loadCentralRegionView) for its CO01E fold-in quirk, but reuses
 * every type and pure helper below rather than duplicating them.
 */

export type RegionMetricStatus = "achieved" | "onTrack" | "behind" | "unknown";

export type RegionMetricBlock = {
  target: number | null;
  achieved: number | null;
  mtdTarget: number | null;
  mtdAchievementPct: number | null;
  /** target - achieved — how much is left to hit the month's target. Negative
   * once already cleared (a surplus, not a gap). */
  gap: number | null;
  /** Where this lands by month-end if the run rate (achieved ÷ working days
   * elapsed) holds for the rest of the month's working days — "at this rate,
   * what would they achieve." */
  projectedEom: number | null;
  /** What's needed per remaining working day to still close `gap` by
   * month-end — "what they should do." Null once there are no working days
   * left, 0 once the target's already met. */
  requiredPerWorkingDay: number | null;
  status: RegionMetricStatus;
};

export type RegionExtSalesBlock = RegionMetricBlock & {
  /** `achieved` above is externalSalesMtd (Part Sale Report) — the same
   * External Sales figure used everywhere else in the app. SPR External is
   * kept here as a reference-only figure since it doesn't share a target
   * with anything, just shown for comparison. */
  sprExternalReference: number | null;
};

export type RegionBranchRow = {
  branch: string;
  label: string;
  gs: RegionMetricBlock;
  bp: RegionMetricBlock;
  ext: RegionExtSalesBlock;
  totalMonthlyTarget: number | null;
  totalAchieved: number | null;
  /** Scrap + used-oil bill revenue, MTD — always a number, never null (same
   * as BranchReport's own scrapRevenueMtd/usedOilRevenueMtd). */
  scrapAndUsedOil: number;
  /** totalAchieved (GS+BP+Ext) + scrapAndUsedOil — mirrors report.ts's
   * totalRevenueStreamMtd formula. Null exactly when totalAchieved is null —
   * scrap/used-oil never resurrects a null total on its own. */
  totalRevenue: number | null;
  /** Small note shown under the branch's column header — e.g. "Body & Paint
   * only" for a satellite branch with no general service. Undefined when
   * there's nothing to flag. */
  badge?: string;
  slab: IncentiveSlabTargets | undefined;
  /** The figure compared against `slab`'s thresholds. Equal to totalRevenue
   * for every generic region; Central's own loader may fold in extra revenue
   * here for a branch whose Slab target still lumps in a satellite's share. */
  slabActual: number | null;
};

export type RegionRevenueView = {
  date: string;
  branches: RegionBranchRow[];
  totals: {
    gs: RegionMetricBlock;
    bp: RegionMetricBlock;
    ext: RegionExtSalesBlock;
    totalMonthlyTarget: number | null;
    totalAchieved: number | null;
    scrapAndUsedOil: number;
    totalRevenue: number | null;
  };
  /** Sum of each branch's Slab 4 threshold — the region's "everyone at the
   * top slab" target. */
  slab4Total: number | null;
  /** slab4Total - totals.totalAchieved. Negative once the region has already
   * cleared the combined Slab 4 bar. */
  balanceToSlab4: number | null;
  /** Sum of each branch's slab1..4 — a region-wide combined slab (sums of
   * ascending thresholds are themselves ascending, so this is a valid set of
   * thresholds). Sums whichever branches have a slab target this month — a
   * branch missing its own slab row no longer blanks out the whole region's
   * indicator. Undefined only when no branch has a slab target at all. */
  regionSlab: IncentiveSlabTargets | undefined;
  workingDays: { elapsed: number; total: number; remaining: number };
  /** HQ-flagged report_holidays, as an array — the Slab indicator's own
   * forecast (lib/pace.ts's computePace) needs the same set. */
  holidays: string[];
  /** How many of the displayed branches have a scom205 upload in for `date`. */
  uploadStatus: { uploaded: number; total: number };
};

export function metricBlock(target: number | null, achieved: number | null, elapsed: number, total: number): RegionMetricBlock {
  const remaining = Math.max(0, total - elapsed);
  const mtdTarget = target !== null && total > 0 ? (target / total) * elapsed : null;
  const mtdAchievementPct = achieved !== null && mtdTarget !== null && mtdTarget !== 0 ? achieved / mtdTarget : null;
  const gap = target !== null && achieved !== null ? target - achieved : null;
  const runRatePerWorkingDay = achieved !== null && elapsed > 0 ? achieved / elapsed : null;
  const projectedEom = runRatePerWorkingDay !== null ? runRatePerWorkingDay * total : null;
  const requiredPerWorkingDay = gap === null ? null : remaining > 0 ? Math.max(0, gap) / remaining : null;

  let status: RegionMetricStatus = "unknown";
  if (target !== null && achieved !== null) {
    if (achieved >= target) status = "achieved";
    else if (projectedEom !== null && projectedEom >= target) status = "onTrack";
    else status = "behind";
  }

  return { target, achieved, mtdTarget, mtdAchievementPct, gap, projectedEom, requiredPerWorkingDay, status };
}

export function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

export type BranchAchieved = {
  gs: number | null;
  bp: number | null;
  ext: number | null;
  sprExternal: number | null;
  /** Scrap + used-oil bill revenue, MTD — always a number, never null. */
  scrapAndUsedOil: number;
};

/** GS/BP/Ext-Sales achieved for one branch's report row, same formula used
 * everywhere on this dashboard. `ext` is externalSalesMtd (Part Sale
 * Report) — the same External Sales figure the rest of the app uses;
 * `sprExternal` (BA Tool) is kept separately, reference-only. */
export function branchAchieved(b: BranchReport | undefined): BranchAchieved {
  const gs = b && b.gusPartsMtd !== null && b.gusLabourMtd !== null ? b.gusPartsMtd + b.gusLabourMtd : null;
  const bp = b && b.bpuPartsMtd !== null && b.bpuLabourMtd !== null ? b.bpuPartsMtd + b.bpuLabourMtd : null;
  const ext = b?.externalSalesMtd ?? null;
  const sprExternal = b?.sprExternalMtd ?? null;
  const scrapAndUsedOil = (b?.scrapRevenueMtd ?? 0) + (b?.usedOilRevenueMtd ?? 0);
  return { gs, bp, ext, sprExternal, scrapAndUsedOil };
}

export function addAchieved(a: BranchAchieved, b: BranchAchieved): BranchAchieved {
  return {
    gs: sumOrNull([a.gs, b.gs]),
    bp: sumOrNull([a.bp, b.bp]),
    ext: sumOrNull([a.ext, b.ext]),
    sprExternal: sumOrNull([a.sprExternal, b.sprExternal]),
    scrapAndUsedOil: a.scrapAndUsedOil + b.scrapAndUsedOil,
  };
}

/** GS+BP+Ext+Scrap&Oil — mirrors report.ts's totalRevenueStreamMtd, the same
 * basis the HQ/admin views already compare Slab achievement against. */
export function totalRevenueStream(a: BranchAchieved): number | null {
  const gsBpExt = sumOrNull([a.gs, a.bp, a.ext]);
  return gsBpExt !== null ? gsBpExt + a.scrapAndUsedOil : null;
}

/** Builds the region-wide totals/slab block shared by every region's
 * view — pulled out so Central's own loader (which assembles its branch
 * rows differently, CO01E fold-in and all) can produce the same `totals` /
 * `slab4Total` / `regionSlab` / `uploadStatus` shape without duplicating
 * this math. */
export function buildRegionTotals(
  branches: RegionBranchRow[],
  displayedBranches: readonly string[],
  byBranch: Map<string, BranchReport>,
  elapsed: number,
  total: number,
): Pick<RegionRevenueView, "totals" | "slab4Total" | "balanceToSlab4" | "regionSlab" | "uploadStatus"> {
  const totalsFor = (pick: (r: RegionBranchRow) => RegionMetricBlock) =>
    metricBlock(sumOrNull(branches.map((r) => pick(r).target)), sumOrNull(branches.map((r) => pick(r).achieved)), elapsed, total);
  const gsTotals = totalsFor((r) => r.gs);
  const bpTotals = totalsFor((r) => r.bp);
  const extTotalsBase = totalsFor((r) => r.ext);
  const extTotals: RegionExtSalesBlock = { ...extTotalsBase, sprExternalReference: sumOrNull(branches.map((r) => r.ext.sprExternalReference)) };

  const totalAchieved = sumOrNull([gsTotals.achieved, bpTotals.achieved, extTotals.achieved]);
  const scrapAndUsedOilTotal = branches.reduce((sum, r) => sum + r.scrapAndUsedOil, 0);
  const totalRevenue = totalAchieved !== null ? totalAchieved + scrapAndUsedOilTotal : null;
  const slab4Total = sumOrNull(branches.map((r) => r.slab?.slab4 ?? null));

  const branchesWithSlab = branches.filter((r) => r.slab !== undefined);
  const regionSlab: IncentiveSlabTargets | undefined =
    branchesWithSlab.length > 0
      ? {
          slab1: branchesWithSlab.reduce((sum, r) => sum + r.slab!.slab1, 0),
          slab2: branchesWithSlab.reduce((sum, r) => sum + r.slab!.slab2, 0),
          slab3: branchesWithSlab.reduce((sum, r) => sum + r.slab!.slab3, 0),
          slab4: branchesWithSlab.reduce((sum, r) => sum + r.slab!.slab4, 0),
        }
      : undefined;

  // bpuPartsMtd is gated purely on today's scom205 upload (unlike gusPartsMtd,
  // which is additionally netted against SSRV089 and would read null for a
  // branch that filed BA Tool but not SSRV089 yet) — the cleaner "did this
  // branch's report land today" signal.
  const uploaded = displayedBranches.filter((branch) => byBranch.get(branch)?.bpuPartsMtd !== null).length;

  return {
    totals: {
      gs: gsTotals,
      bp: bpTotals,
      ext: extTotals,
      totalMonthlyTarget: sumOrNull([gsTotals.target, bpTotals.target, extTotals.target]),
      totalAchieved,
      scrapAndUsedOil: scrapAndUsedOilTotal,
      totalRevenue,
    },
    slab4Total,
    balanceToSlab4: slab4Total !== null && totalAchieved !== null ? slab4Total - totalAchieved : null,
    regionSlab,
    uploadStatus: { uploaded, total: displayedBranches.length },
  };
}

/** South/North's own dashboard data — South and North have no satellite
 * fold-in quirk like Central's CO01E, so this is a straight per-branch read
 * of each region's branches as REGIONS already lists them. Central keeps
 * its own loader (central-region-data.ts's loadCentralRegionView) for that
 * quirk, so this is never actually called with "Central" in practice, but
 * nothing here depends on that. */
export async function loadRegionRevenueView(region: RegionName, date: string, report: Report): Promise<RegionRevenueView> {
  const month = date.slice(0, 7);
  const displayedBranches: readonly string[] = REGIONS[region];

  const [targets, slabs, holidays] = await Promise.all([
    loadRegionRevenueTargets(month, displayedBranches),
    loadIncentiveSlabTargets(month),
    loadReportHolidaySet(),
  ]);

  const elapsed = sundayOffWorkingDaysElapsedInMonth(date, holidays);
  const total = sundayOffWorkingDaysInMonth(date, holidays);
  const workingDays = { elapsed, total, remaining: Math.max(0, total - elapsed) };

  const byBranch = new Map(report.branches.map((b) => [b.branch, b]));

  const branches: RegionBranchRow[] = displayedBranches.map((branch) => {
    const b = byBranch.get(branch);
    const t: RegionRevenueTargets | undefined = targets.get(branch);
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
      badge: BODY_PAINT_ONLY_BRANCHES.has(branch) ? "Body & Paint only" : undefined,
      slab: slabs.get(branch),
      slabActual: totalRevenue,
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
