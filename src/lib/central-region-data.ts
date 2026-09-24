import type { Report, BranchReport } from "./report";
import { loadIncentiveSlabTargets, type IncentiveSlabTargets } from "./incentive-slabs/store";
import { loadRegionRevenueTargets, type RegionRevenueTargets } from "./region-targets/store";
import { loadReportHolidaySet } from "./report-holidays/store";
import { sundayOffWorkingDaysElapsedInMonth, sundayOffWorkingDaysInMonth } from "./reporting-date";

/**
 * Data for the Central regional manager's own dashboard layout (built
 * 2026-09-24 to replace his personal Excel tracker — see the conversation
 * for the full trace of which figure maps to which formula in his sheet).
 * Deliberately its own module, not folded into branch-view-data.ts's
 * loadRegionView — nothing here is reused by the generic RegionAccountPage
 * that North/South still see, and keeping it separate makes that boundary
 * obvious rather than relying on an `if (region === "Central")` buried
 * inside shared code.
 */

/** CO01E (a Body & Paint-only satellite, run out of Tower/CO01B) gets its
 * own column starting this month — before it, its revenue is folded into
 * CO01B's own Slab ring only (its incentive slab threshold already assumes
 * CO01E's contribution; see loadCentralRegionView's co01ePreSplitAchieved).
 * Confirmed with the user 2026-09-24. */
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

function centralBranchesForMonth(month: string): CentralBranchCode[] {
  return month >= CO01E_SPLIT_MONTH ? [...CENTRAL_BRANCH_ORDER] : CENTRAL_BRANCH_ORDER.filter((b) => b !== "CO01E");
}

export type CentralMetricStatus = "achieved" | "onTrack" | "behind" | "unknown";

export type CentralMetricBlock = {
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
  status: CentralMetricStatus;
};

export type CentralExtSalesBlock = CentralMetricBlock & {
  /** externalSalesMtd (Part Sale Report) shown for reference alongside SPR
   * External — no target of its own, so no MTD Target/Achievement%/forecast
   * here, just the raw figure for comparison. */
  partSaleReference: number | null;
};

export type CentralBranchRow = {
  branch: CentralBranchCode;
  label: string;
  gs: CentralMetricBlock;
  bp: CentralMetricBlock;
  ext: CentralExtSalesBlock;
  totalMonthlyTarget: number | null;
  totalAchieved: number | null;
  /** What's compared against `slab` below — equal to totalAchieved, except
   * CO01B before CO01E's split, where CO01E's own totalAchieved is folded
   * in too (see the module comment above). */
  slabActual: number | null;
  slab: IncentiveSlabTargets | undefined;
};

export type CentralRegionView = {
  date: string;
  branches: CentralBranchRow[];
  totals: {
    gs: CentralMetricBlock;
    bp: CentralMetricBlock;
    ext: CentralExtSalesBlock;
    totalMonthlyTarget: number | null;
    totalAchieved: number | null;
  };
  /** Sum of each branch's Slab 4 threshold — the region's "everyone at the
   * top slab" target, mirroring his sheet's I3. */
  slab4Total: number | null;
  /** slab4Total - totals.totalAchieved — his sheet's I5 "Balance". Negative
   * once the region has already cleared the combined Slab 4 bar. */
  balanceToSlab4: number | null;
  /** Sum of each branch's slab1..4 — a region-wide combined slab (sums of
   * ascending thresholds are themselves ascending, so this is a valid set of
   * thresholds, not just slab4Total in isolation). Undefined unless every
   * displayed branch has a slab target this month, same "no partial
   * thresholds" rule as a single branch missing its own slab row. */
  regionSlab: IncentiveSlabTargets | undefined;
  workingDays: { elapsed: number; total: number; remaining: number };
  /** How many of the displayed branches have a scom205 upload in for `date`
   * — same signal the CEO page's DraftWarning already uses, just scoped to
   * these branches instead of company-wide. */
  uploadStatus: { uploaded: number; total: number };
};

function metricBlock(target: number | null, achieved: number | null, elapsed: number, total: number): CentralMetricBlock {
  const remaining = Math.max(0, total - elapsed);
  const mtdTarget = target !== null && total > 0 ? (target / total) * elapsed : null;
  const mtdAchievementPct = achieved !== null && mtdTarget !== null && mtdTarget !== 0 ? achieved / mtdTarget : null;
  const gap = target !== null && achieved !== null ? target - achieved : null;
  const runRatePerWorkingDay = achieved !== null && elapsed > 0 ? achieved / elapsed : null;
  const projectedEom = runRatePerWorkingDay !== null ? runRatePerWorkingDay * total : null;
  const requiredPerWorkingDay = gap === null ? null : remaining > 0 ? Math.max(0, gap) / remaining : null;

  let status: CentralMetricStatus = "unknown";
  if (target !== null && achieved !== null) {
    if (achieved >= target) status = "achieved";
    else if (projectedEom !== null && projectedEom >= target) status = "onTrack";
    else status = "behind";
  }

  return { target, achieved, mtdTarget, mtdAchievementPct, gap, projectedEom, requiredPerWorkingDay, status };
}

function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

/** GS/BP/Ext-Sales achieved for one branch's report row, same formula used
 * everywhere on this dashboard — pulled out so CO01B's pre-split Slab
 * fold-in (which needs CO01E's total without CO01E being a displayed
 * branch) can reuse it instead of duplicating the math. */
function branchAchieved(b: BranchReport | undefined): { gs: number | null; bp: number | null; ext: number | null; total: number | null } {
  const gs = b && b.gusPartsMtd !== null && b.gusLabourMtd !== null ? b.gusPartsMtd + b.gusLabourMtd : null;
  const bp = b && b.bpuPartsMtd !== null && b.bpuLabourMtd !== null ? b.bpuPartsMtd + b.bpuLabourMtd : null;
  const ext = b?.sprExternalMtd ?? null;
  return { gs, bp, ext, total: sumOrNull([gs, bp, ext]) };
}

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
  // Read regardless of whether CO01E is a displayed branch this month — its
  // total is only used for CO01B's slabActual fold-in below when it isn't.
  const co01eAchieved = branchAchieved(byBranch.get("CO01E")).total;

  const branches: CentralBranchRow[] = displayedBranches.map((branch) => {
    const b: BranchReport | undefined = byBranch.get(branch);
    const t: RegionRevenueTargets | undefined = targets.get(branch);
    const achieved = branchAchieved(b);

    const gs = metricBlock(t?.gsTarget ?? null, achieved.gs, elapsed, total);
    const bp = metricBlock(t?.bpTarget ?? null, achieved.bp, elapsed, total);
    const extBase = metricBlock(t?.extTarget ?? null, achieved.ext, elapsed, total);
    const ext: CentralExtSalesBlock = { ...extBase, partSaleReference: b?.externalSalesMtd ?? null };

    const totalAchieved = sumOrNull([gs.achieved, bp.achieved, ext.achieved]);
    const slabActual = branch === "CO01B" && !co01eIsSplit ? sumOrNull([totalAchieved, co01eAchieved]) : totalAchieved;

    return {
      branch,
      label: CENTRAL_BRANCH_LABELS[branch],
      gs,
      bp,
      ext,
      totalMonthlyTarget: sumOrNull([gs.target, bp.target, ext.target]),
      totalAchieved,
      slabActual,
      slab: slabs.get(branch),
    };
  });

  const totalsFor = (pick: (r: CentralBranchRow) => CentralMetricBlock) =>
    metricBlock(sumOrNull(branches.map((r) => pick(r).target)), sumOrNull(branches.map((r) => pick(r).achieved)), elapsed, total);
  const gsTotals = totalsFor((r) => r.gs);
  const bpTotals = totalsFor((r) => r.bp);
  const extTotalsBase = totalsFor((r) => r.ext);
  const extTotals: CentralExtSalesBlock = { ...extTotalsBase, partSaleReference: sumOrNull(branches.map((r) => r.ext.partSaleReference)) };

  const totalAchieved = sumOrNull([gsTotals.achieved, bpTotals.achieved, extTotals.achieved]);
  const slab4Total = sumOrNull(branches.map((r) => r.slab?.slab4 ?? null));

  const allSlabsPresent = branches.every((r) => r.slab !== undefined);
  const regionSlab: IncentiveSlabTargets | undefined = allSlabsPresent
    ? {
        slab1: branches.reduce((sum, r) => sum + r.slab!.slab1, 0),
        slab2: branches.reduce((sum, r) => sum + r.slab!.slab2, 0),
        slab3: branches.reduce((sum, r) => sum + r.slab!.slab3, 0),
        slab4: branches.reduce((sum, r) => sum + r.slab!.slab4, 0),
      }
    : undefined;

  // bpuPartsMtd is gated purely on today's scom205 upload (unlike gusPartsMtd,
  // which is additionally netted against SSRV089 and would read null for a
  // branch that filed BA Tool but not SSRV089 yet) — the cleaner "did this
  // branch's report land today" signal, and it works the same way for
  // CO01E (Body & Paint-only) as for every other branch.
  const uploaded = displayedBranches.filter((branch) => byBranch.get(branch)?.bpuPartsMtd !== null).length;

  return {
    date,
    branches,
    totals: {
      gs: gsTotals,
      bp: bpTotals,
      ext: extTotals,
      totalMonthlyTarget: sumOrNull([gsTotals.target, bpTotals.target, extTotals.target]),
      totalAchieved,
    },
    slab4Total,
    balanceToSlab4: slab4Total !== null && totalAchieved !== null ? slab4Total - totalAchieved : null,
    regionSlab,
    workingDays,
    uploadStatus: { uploaded, total: displayedBranches.length },
  };
}
