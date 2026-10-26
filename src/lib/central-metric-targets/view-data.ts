import type { RankInfo } from "../gus-per-car-trend";
import { rankValues } from "../gus-per-car-trend";
import { computeAnnualPace, computePace, paceTone, type AnnualPace, type Pace } from "../pace";
import type { AchievementTone } from "../aggregate";
import type { BranchReport } from "../report";
import { loadCentralMetricTargets, loadCentralMetricTargetsForYear, type CentralMetricTargets } from "./store";
import { loadCentralMonthlyActuals } from "./monthly-actuals";
import { CENTRAL_METRICS, type CentralMetricKey } from "./metrics";

export { CENTRAL_METRICS, type CentralMetricKey };

export function targetFor(t: CentralMetricTargets | undefined, key: CentralMetricKey): number | null {
  if (!t) return null;
  switch (key) {
    case "bpu": return t.bpuTarget;
    case "offtake": return t.offtakeTarget;
    case "sprInternal": return t.sprInternalTarget;
    case "sprExternal": return t.sprExternalTarget;
    case "pmOc": return t.pmOcTarget;
    case "battery": return t.batteryTarget;
    case "tyre": return t.tyreTarget;
  }
}

/** BA Tool's own live target field for one metric, read straight off the
 * already-built BranchReport (bpuTarget etc. — see report.ts, which already
 * resolves these from the day's BA Tool snapshot, with target-overrides.ts's
 * overrides applied where relevant — this is what makes it safe to use for
 * CO01B, whose BPU/Offtake/SPR Internal BA Tool figures are really CO01B+
 * CO01E combined). sprExternal has no BA Tool target field at all, so it's
 * always null here. Used as a fallback whenever a branch has no manually-set
 * target for the month — originally South/North-only (2026-10-20), extended
 * to Central (2026-10-22) once the RM asked for the same behaviour there;
 * see loadCentralMetricTargetsView. Exported so the Set Targets forms
 * (central + region) can prefill with the same value. */
export function baToolTargetFromReport(r: BranchReport, key: CentralMetricKey): number | null {
  switch (key) {
    case "bpu": return r.bpuTarget;
    case "offtake": return r.offtakeTarget;
    case "sprInternal": return r.partsRetailTarget;
    case "sprExternal": return null;
    case "pmOc": return r.pmOcTarget;
    case "battery": return r.batteryTarget;
    case "tyre": return r.tireTarget;
  }
}

function achievedFromReport(r: BranchReport, key: CentralMetricKey): number | null {
  switch (key) {
    case "bpu": return r.bpuAchievementForTheMonth;
    case "offtake": return r.offtakeAchievementForTheMonth;
    case "sprInternal": return r.partsRetailAchievementForTheMonth;
    case "sprExternal": return r.externalSalesMtd;
    case "pmOc": return r.pmOcAchievementForTheMonth;
    case "battery": return r.batterySalesForTheMonth;
    case "tyre": return r.tireSalesForTheMonth;
  }
}

function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

/** CO01B/CO01E fold-in for the LIVE current month (2026-09-26, made
 * unconditional 2026-10-20 at the RM's request — CO01E is a small satellite
 * run out of CO01B/Tower, and he wants it folded into CO01B's TKM Targets
 * row permanently, regardless of the general BA Tool target-split cutover
 * that governs the Revenue Dashboard's own separate CO01E column). */
function liveAchieved(branch: string, report: BranchReport, key: CentralMetricKey, co01eReport: BranchReport | undefined): number | null {
  const own = achievedFromReport(report, key);
  if (branch !== "CO01B" || !co01eReport) return own;
  return sumOrNull([own, achievedFromReport(co01eReport, key)]);
}

function achievedFromActuals(a: Awaited<ReturnType<typeof loadCentralMonthlyActuals>>, key: CentralMetricKey): number | null {
  switch (key) {
    case "bpu": return a.bpuAchieved;
    case "offtake": return a.offtakeAchieved;
    case "sprInternal": return a.sprInternalAchieved;
    case "sprExternal": return a.sprExternalAchieved;
    case "pmOc": return a.pmOcAchieved;
    case "battery": return a.batteryAchieved;
    case "tyre": return a.tyreAchieved;
  }
}

export type MonthlyBreakdownEntry = {
  month: string;
  target: number | null;
  achieved: number | null;
};

export type CentralMetricBranchRow = {
  branch: string;
  target: number | null;
  achieved: number | null;
  pace: Pace;
  paceTone: AchievementTone;
  annualTarget: number | null;
  achievedYtd: number | null;
  annualPace: AnnualPace;
  rank: RankInfo | null;
  /** Jan..current month, in order — for the "all months at once" breakdown
   * table (2026-09-26). */
  monthly: MonthlyBreakdownEntry[];
};

export type CentralMetricView = {
  key: CentralMetricKey;
  label: string;
  isCurrency: boolean;
  rows: CentralMetricBranchRow[];
};

/**
 * Full TKM Targets view for a region's 7 tracked metrics (2026-09-26,
 * originally Central-only) — one row per branch per metric, MTD pace,
 * full-year pace, and a rank among the given branches for each metric.
 * `branches` must already be this date's BranchReport rows (reused from
 * whatever the page already loaded via buildReport — this function does no
 * report-building of its own, only the extra target/historical-actuals
 * queries this feature needs on top of that).
 *
 * A branch with no manually-set row for the current month falls back to BA
 * Tool's own live target field for whichever of the 6 metrics has one
 * (sprExternal never does — see baToolTargetFromReport); a manually-saved
 * target for the month always wins regardless. All three regions behave the
 * same way here (2026-10-20, extended to Central 2026-10-22 at the RM's
 * request). Only the CURRENT month's target gets this fallback — closed
 * months' historical/annual figures are unaffected, same "no target set →
 * drops out" convention as always.
 */
export async function loadCentralMetricTargetsView(
  branches: BranchReport[],
  date: string,
  holidays: ReadonlySet<string>,
  co01eReport?: BranchReport
): Promise<CentralMetricView[]> {
  const branchCodes = branches.map((b) => b.branch);
  const month = date.slice(0, 7);
  const year = date.slice(0, 4);

  const currentTargets = await loadCentralMetricTargets(month, branchCodes);

  // Per-branch: every month's target Jan..current, and every CLOSED month's
  // final achieved (current month's achieved comes from the live BranchReport
  // instead, never from this historical query).
  const perBranchYearData = await Promise.all(
    branches.map(async (report) => {
      const yearTargets = await loadCentralMetricTargetsForYear(year, month, report.branch);
      const closedMonths = [...yearTargets.keys()].filter((m) => m < month);
      const closedActuals = await Promise.all(closedMonths.map((m) => loadCentralMonthlyActuals(report.branch, m)));
      return { branch: report.branch, report, yearTargets, closedMonths, closedActuals };
    })
  );

  return CENTRAL_METRICS.map(({ key, label, isCurrency }) => {
    const rows: CentralMetricBranchRow[] = perBranchYearData.map(({ branch, report, yearTargets, closedMonths, closedActuals }) => {
      const manualTarget = targetFor(currentTargets.get(branch), key);
      const target = manualTarget !== null ? manualTarget : baToolTargetFromReport(report, key);
      const achieved = liveAchieved(branch, report, key, co01eReport);
      const pace = computePace(date, achieved, target, holidays);
      const tone = paceTone(date, achieved, target, holidays);

      let annualTarget = 0;
      let hasAnyTarget = false;
      for (const t of yearTargets.values()) {
        const v = targetFor(t, key);
        if (v !== null) { annualTarget += v; hasAnyTarget = true; }
      }
      // If the current month's target itself isn't set, don't count it in
      // the annual sum either — same "no ratio, drops out" convention used
      // everywhere else in this app rather than silently treating missing
      // as zero.
      let achievedYtd = 0;
      let hasAnyAchieved = false;
      const monthly: MonthlyBreakdownEntry[] = [];
      closedMonths.forEach((m, i) => {
        const v = achievedFromActuals(closedActuals[i], key);
        if (v !== null) { achievedYtd += v; hasAnyAchieved = true; }
        monthly.push({ month: m, target: targetFor(yearTargets.get(m), key), achieved: v });
      });
      if (achieved !== null) { achievedYtd += achieved; hasAnyAchieved = true; }
      monthly.push({ month, target, achieved });

      const annualPace = computeAnnualPace(date, hasAnyAchieved ? achievedYtd : null, hasAnyTarget ? annualTarget : null);

      return {
        branch,
        target,
        achieved,
        pace,
        paceTone: tone,
        annualTarget: hasAnyTarget ? annualTarget : null,
        achievedYtd: hasAnyAchieved ? achievedYtd : null,
        annualPace,
        rank: null, // filled in below, once every branch's value for this metric is known
        monthly,
      };
    });

    const rankable = rows.map((r) => ({ branch: r.branch, value: r.achieved })).filter((r): r is { branch: string; value: number } => r.value !== null);
    const rankMap = rankValues(rankable);
    for (const r of rows) r.rank = rankMap.get(r.branch) ?? null;

    return { key, label, isCurrency, rows };
  });
}
