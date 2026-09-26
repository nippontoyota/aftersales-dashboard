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
};

export type CentralMetricView = {
  key: CentralMetricKey;
  label: string;
  isCurrency: boolean;
  rows: CentralMetricBranchRow[];
};

/**
 * Full TKM Targets view for the Central region's 7 tracked metrics
 * (2026-09-26) — one row per branch per metric, MTD pace, full-year pace,
 * and a rank among the 4 Central branches for each metric. `branches` must
 * already be this date's BranchReport rows for CO01A/CO01B/MV01A/KY01A
 * (reused from whatever the page already loaded via buildReport — this
 * function does no report-building of its own, only the extra target/
 * historical-actuals queries this feature needs on top of that).
 */
export async function loadCentralMetricTargetsView(branches: BranchReport[], date: string): Promise<CentralMetricView[]> {
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
      const target = targetFor(currentTargets.get(branch), key);
      const achieved = achievedFromReport(report, key);
      const pace = computePace(date, achieved, target);
      const tone = paceTone(date, achieved, target);

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
      closedMonths.forEach((_, i) => {
        const v = achievedFromActuals(closedActuals[i], key);
        if (v !== null) { achievedYtd += v; hasAnyAchieved = true; }
      });
      if (achieved !== null) { achievedYtd += achieved; hasAnyAchieved = true; }

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
      };
    });

    const rankable = rows.map((r) => ({ branch: r.branch, value: r.achieved })).filter((r): r is { branch: string; value: number } => r.value !== null);
    const rankMap = rankValues(rankable);
    for (const r of rows) r.rank = rankMap.get(r.branch) ?? null;

    return { key, label, isCurrency, rows };
  });
}
