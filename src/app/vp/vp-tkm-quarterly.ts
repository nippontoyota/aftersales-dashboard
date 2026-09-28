import { pool } from "@/lib/db";
import { REGIONS, regionForBranch, type RegionName } from "@/lib/regions";
import type { Report } from "@/lib/report";
import { targetOverrideFor } from "@/lib/target-overrides";

/**
 * The quarterly TKM Targets rollup (2026-09-28, at the VP's request — he's
 * currently hard-blocked from /tkm-targets entirely, redirected back to
 * /vp; this is his own version, matching the Jul/Aug/Sep-into-Q3 layout of
 * his own Excel). Same 4 metrics as the main dashboard's /tkm-targets page
 * (BPU, Offtake, Parts Retail, PM+OC), rolled up by region + Group instead
 * of by branch, for whichever calendar quarter the viewed date falls in.
 *
 * The achieved side reuses the same "last BA Tool snapshot of the month"
 * convention as central-metric-targets/monthly-actuals.ts (proven there,
 *2026-09-26) — these are cumulative-within-month figures, so the final
 * snapshot dated within a closed month IS that month's total. That file is
 * Central-only (it backs a dedicated targets table built specifically to
 * replace the Central RM's own Excel); this reads straight off BA Tool's
 * own target columns instead, so it works for every region, and applies
 * the same CO01B/CO01E target-overrides.ts split every other target read in
 * the app already goes through.
 */

export type TkmMetricKey = "bpu" | "offtake" | "partsRetail" | "pmOc";

export const TKM_METRICS: { key: TkmMetricKey; label: string; isCurrency: boolean }[] = [
  { key: "bpu", label: "BPU", isCurrency: false },
  { key: "offtake", label: "Offtake", isCurrency: true },
  { key: "partsRetail", label: "Parts Retail", isCurrency: true },
  { key: "pmOc", label: "PM+OC", isCurrency: false },
];

type MetricPoint = { target: number | null; achieved: number | null };
type BranchMonthMetrics = Record<TkmMetricKey, MetricPoint>;

/** The 3 calendar months of the quarter `date` falls in, oldest first, as 'YYYY-MM'. */
export function quarterMonthsFor(date: string): string[] {
  const [y, m] = date.split("-").map(Number);
  const quarterStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  return [0, 1, 2].map((i) => `${y}-${String(quarterStartMonth + i).padStart(2, "0")}`);
}

function numOrNull(v: string | null): number | null {
  return v === null ? null : Number(v);
}

/** BPU/Offtake/Parts Retail/PM+OC target+achieved from each branch's last
 * BA Tool snapshot dated within `month`, for every branch at once — one
 * query per closed month, not one per branch per month (a per-branch loop
 * here would fire a couple dozen concurrent queries at once against the
 * shared pool, the same contention that broke an unrelated query earlier
 * this session — see the "suffocating" scrolling pass's memory note).
 * DISTINCT ON picks each branch's latest-dated row within the month. */
async function loadClosedMonthMetricsForAllBranches(month: string): Promise<Map<string, BranchMonthMetrics>> {
  const { rows } = await pool.query<{
    branch: string;
    date: string;
    bpus: string | null;
    bpus_target: string | null;
    spo_dealer: string | null;
    spo_dealer_target: string | null;
    spr_internal: string | null;
    spr_internal_target: string | null;
    pm: string | null;
    pm_target: string | null;
  }>(
    `select distinct on (branch) branch, date::text as date, bpus, bpus_target, spo_dealer, spo_dealer_target, spr_internal, spr_internal_target, pm, pm_target
       from ba_tool_snapshots
      where to_char(date, 'YYYY-MM') = $1
      order by branch, date desc`,
    [month]
  );
  const map = new Map<string, BranchMonthMetrics>();
  for (const r of rows) {
    const override = targetOverrideFor(r.branch, r.date);
    map.set(r.branch, {
      bpu: { target: override?.bpuTarget ?? numOrNull(r.bpus_target), achieved: numOrNull(r.bpus) },
      offtake: { target: override?.offtakeTarget ?? numOrNull(r.spo_dealer_target), achieved: numOrNull(r.spo_dealer) },
      partsRetail: { target: override?.partsRetailTarget ?? numOrNull(r.spr_internal_target), achieved: numOrNull(r.spr_internal) },
      pmOc: { target: numOrNull(r.pm_target), achieved: numOrNull(r.pm) },
    });
  }
  return map;
}

/** Same 4 metrics, straight off an already-loaded live BranchReport — for
 * the current (not-yet-closed) month in the quarter, so it never needs its
 * own query and always matches whatever the rest of the page is showing. */
function liveMonthMetrics(report: Report, branch: string): BranchMonthMetrics | null {
  const b = report.branches.find((x) => x.branch === branch);
  if (!b) return null;
  return {
    bpu: { target: b.bpuTarget, achieved: b.bpuAchievementForTheMonth },
    offtake: { target: b.offtakeTarget, achieved: b.offtakeAchievementForTheMonth },
    partsRetail: { target: b.partsRetailTarget, achieved: b.partsRetailAchievementForTheMonth },
    pmOc: { target: b.pmOcTarget, achieved: b.pmOcAchievementForTheMonth },
  };
}

export type TkmMonthCell = { month: string; target: number | null; achieved: number | null };
export type TkmMetricRow = {
  key: TkmMetricKey;
  label: string;
  isCurrency: boolean;
  months: TkmMonthCell[]; // 3 months, oldest first
  quarterTarget: number | null;
  quarterAchieved: number | null;
  /** quarterAchieved ÷ quarterTarget. */
  achievementRatio: number | null;
  /** quarterTarget − quarterAchieved. Negative means the quarter's target is already cleared. */
  gap: number | null;
};
export type TkmScopeQuarter = { label: string; region: RegionName | null; metrics: TkmMetricRow[] };

function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

function sumMetricAcross(branchMonths: (BranchMonthMetrics | null)[], key: TkmMetricKey, field: "target" | "achieved"): number | null {
  return sumOrNull(branchMonths.map((m) => m?.[key]?.[field] ?? null));
}

/**
 * `date`'s quarter, rolled up to Group + each region. `currentReport` must
 * already be `buildReport(date)` — reused here rather than re-fetched, same
 * as loadVpData's own previous/last-month comparisons.
 */
export async function loadVpTkmQuarterly(date: string, currentReport: Report): Promise<TkmScopeQuarter[]> {
  const months = quarterMonthsFor(date);
  const currentMonth = date.slice(0, 7);
  const closedMonths = months.filter((m) => m !== currentMonth && m <= currentMonth);

  const branches = currentReport.branches.map((b) => b.branch);

  // One query per closed month (every branch at once), sequential rather
  // than Promise.all'd — a quarter only ever has at most 2 closed months to
  // fetch, so there's no real latency cost, and it keeps peak concurrent
  // queries against the shared pool to one at a time.
  const closedByMonth = new Map<string, Map<string, BranchMonthMetrics>>();
  for (const month of closedMonths) {
    closedByMonth.set(month, await loadClosedMonthMetricsForAllBranches(month));
  }

  function metricsFor(branch: string, month: string): BranchMonthMetrics | null {
    return month === currentMonth ? liveMonthMetrics(currentReport, branch) : (closedByMonth.get(month)?.get(branch) ?? null);
  }

  function buildScope(label: string, region: RegionName | null, scopeBranches: string[]): TkmScopeQuarter {
    const metrics: TkmMetricRow[] = TKM_METRICS.map(({ key, label: metricLabel, isCurrency }) => {
      const monthCells: TkmMonthCell[] = months.map((month) => {
        const branchMonths = scopeBranches.map((b) => metricsFor(b, month));
        return { month, target: sumMetricAcross(branchMonths, key, "target"), achieved: sumMetricAcross(branchMonths, key, "achieved") };
      });
      const quarterTarget = sumOrNull(monthCells.map((c) => c.target));
      const quarterAchieved = sumOrNull(monthCells.map((c) => c.achieved));
      const achievementRatio = quarterTarget !== null && quarterAchieved !== null && quarterTarget !== 0 ? quarterAchieved / quarterTarget : null;
      const gap = quarterTarget !== null && quarterAchieved !== null ? quarterTarget - quarterAchieved : null;
      return { key, label: metricLabel, isCurrency, months: monthCells, quarterTarget, quarterAchieved, achievementRatio, gap };
    });
    return { label, region, metrics };
  }

  return [
    buildScope("Group", null, branches),
    ...(Object.keys(REGIONS) as RegionName[]).map((region) => buildScope(region, region, branches.filter((b) => regionForBranch(b) === region))),
  ];
}
