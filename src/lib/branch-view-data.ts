import { buildReport, BODY_PAINT_ONLY_BRANCHES, type BranchReport, type Report } from "./report";
import { REGIONS, regionForBranch, type RegionName } from "./regions";
import { listSnapshotDates, loadSnapshotsForMonthUpTo, type Snapshot } from "./snapshot-store";
import { loadAllServiceInfoSnapshotsForMonthUpTo, type ServiceInfoSnapshot } from "./service-info/store";
import { loadReportHolidaySet } from "./report-holidays/store";
import { computeVasTrendSeries, type TrendPoint } from "./trend";

/**
 * Everything the branch-first dashboard (a branch account, or one card in a
 * regional manager's grid) needs, computed once per branch. Reuses
 * `buildReport` per month-date rather than re-deriving the revenue maths, so
 * the trend line and "since last upload" figure can never drift from the
 * canonical numbers. One set of `buildReport` calls (O(dates), not O(dates ×
 * branches)) backs every branch in a region.
 */

export type BranchMetricKey = "totalRevenue" | "revenuePerCar" | "vasPct";

export const BRANCH_METRIC_LABELS: Record<BranchMetricKey, string> = {
  totalRevenue: "Total Revenue Stream MTD",
  revenuePerCar: "Revenue per Car (MTD)",
  vasPct: "VAS Bill — % of target",
};

export type BranchRank = { rank: number; of: number } | null;

export type LeaderboardRow = { branch: string; region: RegionName | null; value: number | null; isYou: boolean };

/** One of the target-graded metrics shown as a stat card on the branch page. */
export type TargetStat = {
  key: string;
  label: string;
  mtd: number | null;
  target: number | null;
  ratio: number | null;
  /** VAS Bill's target is itself month-to-date (scales with RO count), so
   * `ratio` already grades it correctly. The four TKM metrics have a fixed
   * *month-end* target, so `ratio` alone reads alarmingly low early in the
   * month — `paceRatio` (ratio ÷ fraction of working days elapsed) is the
   * honest "are you on track" number. Null for VAS. */
  paceRatio: number | null;
  mtdTarget: boolean;
  rank: BranchRank;
};

export type BranchView = {
  branch: string;
  region: RegionName | null;
  report: BranchReport;
  /** Every branch's current-date report — for the All / Central / South / North panel. */
  allBranches: BranchReport[];

  totalRevenueMtd: number | null;
  revenuePerCar: number | null;
  vasPct: number | null;

  ranks: Record<BranchMetricKey, BranchRank>;

  /** VAS Bill + the four TKM target metrics (BPU, Offtake, Parts Retail, PM+OC). */
  targetStats: TargetStat[];

  workingDays: { elapsed: number; total: number };
  projectedTotalRevenue: number | null;

  lastMonth: { label: string; totalRevenue: number | null } | null;

  benchmarks: {
    regionAvgTotal: number | null;
    companyAvgTotal: number | null;
    regionAvgPerCar: number | null;
    companyAvgPerCar: number | null;
  };

  daysSincePrevious: number | null;
  sinceLastUpload: { label: string; revenue: number | null; vasBill: number | null };

  trend: { total: TrendPoint[]; vas: TrendPoint[] };

  leaderboards: Record<BranchMetricKey, LeaderboardRow[]>;
};

/** Combined GUS + BPU ROs — same denominator as revenue-per-car-leaderboard.tsx. */
function totalRevenuePerCar(b: BranchReport): number | null {
  const ros = b.gusRoMtd !== null || b.bpuRoMtd !== null ? (b.gusRoMtd ?? 0) + (b.bpuRoMtd ?? 0) : null;
  if (ros === null || ros === 0 || b.totalRevenueStreamMtd === null) return null;
  return b.totalRevenueStreamMtd / ros;
}

const METRIC_VALUE: Record<BranchMetricKey, (b: BranchReport) => number | null> = {
  totalRevenue: (b) => b.totalRevenueStreamMtd,
  revenuePerCar: totalRevenuePerCar,
  vasPct: (b) => b.vasAchievementPercent,
};

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

const SATURDAY = 6;

/** Working days = calendar days minus Saturdays minus HQ-flagged holidays —
 * the same "what counts as a report date" rule as lib/reporting-date.ts,
 * applied across a whole month for run-rate projection. */
function countWorkingDays(year: number, monthIndex0: number, lastDay: number, holidays: ReadonlySet<string>): number {
  let n = 0;
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(Date.UTC(year, monthIndex0, day));
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== SATURDAY && !holidays.has(iso)) n++;
  }
  return n;
}

function monthName(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });
}

type Shared = {
  date: string;
  report: Report;
  reportsByDate: { date: string; report: Report }[];
  prevMonthReport: Report | null;
  prevMonthEndDate: string | null;
  monthSnapshots: Snapshot[];
  serviceInfoMonthSnapshots: ServiceInfoSnapshot[];
  holidays: ReadonlySet<string>;
};

/** Load the data shared by every branch on the page (a regional grid reuses
 * one call across all its branches). `report` / `monthSnapshots` /
 * `serviceInfoMonthSnapshots` are already loaded by dashboard-data — pass
 * them in to avoid a second fetch. */
async function loadShared(
  date: string,
  report: Report,
  monthSnapshots: Snapshot[],
  serviceInfoMonthSnapshots: ServiceInfoSnapshot[],
): Promise<Shared> {
  const allDates = await listSnapshotDates();
  const month = date.slice(0, 7);
  const monthDates = allDates.filter((d) => d.slice(0, 7) === month && d < date);

  const prevMonthPrefix = (() => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return d.toISOString().slice(0, 7);
  })();
  const prevMonthEndDate = allDates.filter((d) => d.slice(0, 7) === prevMonthPrefix).at(-1) ?? null;

  const [priorReports, prevMonthReport, holidays] = await Promise.all([
    Promise.all(monthDates.map(async (d) => ({ date: d, report: await buildReport(d) }))),
    prevMonthEndDate ? buildReport(prevMonthEndDate) : Promise.resolve(null),
    loadReportHolidaySet(),
  ]);

  const reportsByDate = [
    ...priorReports.filter((r): r is { date: string; report: Report } => r.report !== null),
    { date, report },
  ];

  return {
    date,
    report,
    reportsByDate,
    prevMonthReport,
    prevMonthEndDate,
    monthSnapshots,
    serviceInfoMonthSnapshots,
    holidays,
  };
}

function buildView(branch: string, shared: Shared): BranchView | null {
  const { date, report, reportsByDate, prevMonthReport, prevMonthEndDate, monthSnapshots, serviceInfoMonthSnapshots, holidays } = shared;
  const branchReport = report.branches.find((b) => b.branch === branch);
  if (!branchReport) return null;

  const region = regionForBranch(branch);
  const all = report.branches;
  // Body & Paint-only branches (no general service) aren't comparable on
  // revenue-per-car or VAS — and their tiny RO counts make them nonsense
  // outliers on a per-car ranking — so they sit out the ranks, leaderboards
  // and benchmark averages (they still count in the region/company totals in
  // the All / Central / South / North panel).
  const rankable = all.filter((b) => !BODY_PAINT_ONLY_BRANCHES.has(b.branch));

  const totalRevenueMtd = branchReport.totalRevenueStreamMtd;
  const revenuePerCar = totalRevenuePerCar(branchReport);
  const vasPct = branchReport.vasAchievementPercent;

  // ---- ranks (across branches that have a value for the metric) ----
  const rankFor = (key: BranchMetricKey): BranchRank => {
    const fn = METRIC_VALUE[key];
    const rows = rankable
      .map((b) => ({ branch: b.branch, value: fn(b) }))
      .filter((r): r is { branch: string; value: number } => r.value !== null)
      .sort((a, b) => b.value - a.value);
    const idx = rows.findIndex((r) => r.branch === branch);
    return idx === -1 ? null : { rank: idx + 1, of: rows.length };
  };
  const ranks: Record<BranchMetricKey, BranchRank> = {
    totalRevenue: rankFor("totalRevenue"),
    revenuePerCar: rankFor("revenuePerCar"),
    vasPct: rankFor("vasPct"),
  };

  // ---- target-graded stat cards (VAS + the four TKM metrics) ----
  // The elapsed fraction is computed below with workingDays; forward-declare.
  const TARGET_DEFS: { key: string; label: string; actual: keyof BranchReport; target: keyof BranchReport; mtdTarget: boolean }[] = [
    { key: "vas", label: "VAS Bill", actual: "vasAchievementForTheMonth", target: "vasBillTarget", mtdTarget: true },
    { key: "bpu", label: "BPU", actual: "bpuAchievementForTheMonth", target: "bpuTarget", mtdTarget: false },
    { key: "offtake", label: "Offtake", actual: "offtakeAchievementForTheMonth", target: "offtakeTarget", mtdTarget: false },
    { key: "partsRetail", label: "Parts Retail", actual: "partsRetailAchievementForTheMonth", target: "partsRetailTarget", mtdTarget: false },
    { key: "pmOc", label: "PM + OC", actual: "pmOcAchievementForTheMonth", target: "pmOcTarget", mtdTarget: false },
  ];

  // ---- working days + projection ----
  const d = new Date(`${date}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m0 = d.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const workingDays = {
    elapsed: countWorkingDays(y, m0, d.getUTCDate(), holidays),
    total: countWorkingDays(y, m0, lastDayOfMonth, holidays),
  };
  const projectedTotalRevenue =
    totalRevenueMtd !== null && workingDays.elapsed > 0
      ? (totalRevenueMtd / workingDays.elapsed) * workingDays.total
      : null;

  const elapsedFraction = workingDays.total > 0 ? workingDays.elapsed / workingDays.total : null;
  const targetStats: TargetStat[] = TARGET_DEFS.map((def) => {
    const ratioOf = (b: BranchReport): number | null => {
      const a = b[def.actual] as number | null;
      const t = b[def.target] as number | null;
      return a !== null && t !== null && t !== 0 ? a / t : null;
    };
    const ratio = ratioOf(branchReport);
    // Rank by the pace-adjusted ratio for fixed-target metrics so "who's on
    // track" isn't just "who's biggest" — VAS's target already moves with RO
    // count so its plain ratio is the right basis.
    const gradeOf = (b: BranchReport): number | null => {
      const r = ratioOf(b);
      if (r === null) return null;
      return def.mtdTarget || elapsedFraction === null || elapsedFraction === 0 ? r : r / elapsedFraction;
    };
    const ranked = rankable
      .map((b) => ({ branch: b.branch, g: gradeOf(b) }))
      .filter((x): x is { branch: string; g: number } => x.g !== null)
      .sort((a, b) => b.g - a.g);
    const idx = ranked.findIndex((x) => x.branch === branch);
    return {
      key: def.key,
      label: def.label,
      mtd: branchReport[def.actual] as number | null,
      target: branchReport[def.target] as number | null,
      ratio,
      paceRatio: def.mtdTarget || ratio === null || elapsedFraction === null || elapsedFraction === 0 ? null : ratio / elapsedFraction,
      mtdTarget: def.mtdTarget,
      rank: idx === -1 ? null : { rank: idx + 1, of: ranked.length },
    };
  });

  // ---- last month ----
  const lastMonth = prevMonthEndDate
    ? {
        label: monthName(prevMonthEndDate),
        totalRevenue: prevMonthReport?.branches.find((b) => b.branch === branch)?.totalRevenueStreamMtd ?? null,
      }
    : null;

  // ---- benchmarks (per-branch averages, general-service branches only) ----
  const regionCodes: readonly string[] = region ? REGIONS[region] : [];
  const regionBranches = rankable.filter((b) => regionCodes.includes(b.branch));
  const benchmarks = {
    companyAvgTotal: mean(rankable.map((b) => b.totalRevenueStreamMtd).filter((v): v is number => v !== null)),
    regionAvgTotal: mean(regionBranches.map((b) => b.totalRevenueStreamMtd).filter((v): v is number => v !== null)),
    companyAvgPerCar: mean(rankable.map(totalRevenuePerCar).filter((v): v is number => v !== null)),
    regionAvgPerCar: mean(regionBranches.map(totalRevenuePerCar).filter((v): v is number => v !== null)),
  };

  // ---- trend ----
  const totalTrend: TrendPoint[] = reportsByDate.map(({ date: pd, report: pr }) => ({
    date: pd,
    actual: pr.branches.find((b) => b.branch === branch)?.totalRevenueStreamMtd ?? null,
    target: null,
  }));
  const vasTrend = computeVasTrendSeries(monthSnapshots, serviceInfoMonthSnapshots, "All", branch);

  // ---- since last upload ----
  const withValue = totalTrend.filter((p) => p.actual !== null);
  const revSinceLast =
    withValue.length >= 2 ? withValue[withValue.length - 1].actual! - withValue[withValue.length - 2].actual! : null;
  const days = report.daysSincePrevious;
  const sinceLabel = days === null || days === 1 ? "Since last upload" : `Last ${days} days`;
  const sinceLastUpload = {
    label: sinceLabel,
    revenue: revSinceLast,
    vasBill: branchReport.vasAchievementForTheDay,
  };

  // ---- leaderboards ----
  const leaderboardFor = (key: BranchMetricKey): LeaderboardRow[] => {
    const fn = METRIC_VALUE[key];
    return rankable
      .map((b) => ({ branch: b.branch, region: regionForBranch(b.branch), value: fn(b), isYou: b.branch === branch }))
      .sort((a, b) => {
        if (a.value === null && b.value === null) return a.branch.localeCompare(b.branch);
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        return b.value - a.value;
      });
  };
  const leaderboards: Record<BranchMetricKey, LeaderboardRow[]> = {
    totalRevenue: leaderboardFor("totalRevenue"),
    revenuePerCar: leaderboardFor("revenuePerCar"),
    vasPct: leaderboardFor("vasPct"),
  };

  return {
    branch,
    region,
    report: branchReport,
    allBranches: all,
    totalRevenueMtd,
    revenuePerCar,
    vasPct,
    ranks,
    targetStats,
    workingDays,
    projectedTotalRevenue,
    lastMonth,
    benchmarks,
    daysSincePrevious: days,
    sinceLastUpload,
    trend: { total: totalTrend, vas: vasTrend },
    leaderboards,
  };
}

export async function loadBranchView(
  branch: string,
  date: string,
  report: Report,
  monthSnapshots: Snapshot[],
  serviceInfoMonthSnapshots: ServiceInfoSnapshot[],
): Promise<BranchView | null> {
  const shared = await loadShared(date, report, monthSnapshots, serviceInfoMonthSnapshots);
  return buildView(branch, shared);
}

// ---------------------------------------------------------------------------
// Regional manager view: a region roll-up + a per-branch table.

export type RegionRollup = {
  region: RegionName;
  totalRevenue: number | null;
  vasActual: number | null;
  vasTarget: number | null;
  vasPct: number | null;
  workingDays: { elapsed: number; total: number };
  projectedTotalRevenue: number | null;
  /** Rank of this region among the three, by total revenue stream. */
  rank: { rank: number; of: number };
  /** All three regions' total revenue stream — for the comparison bars. */
  allRegions: { region: RegionName; totalRevenue: number | null }[];
};

export async function loadRegionView(
  region: RegionName,
  date: string,
  report: Report,
  monthSnapshots: Snapshot[],
  serviceInfoMonthSnapshots: ServiceInfoSnapshot[],
): Promise<{ rollup: RegionRollup; branches: BranchView[] }> {
  const shared = await loadShared(date, report, monthSnapshots, serviceInfoMonthSnapshots);
  const present = new Set(report.branches.map((b) => b.branch));

  const branches = (REGIONS[region] as readonly string[])
    .filter((code) => present.has(code))
    .map((code) => buildView(code, shared))
    .filter((v): v is BranchView => v !== null);

  const regionSum = (rg: RegionName, pick: (b: BranchReport) => number | null): number | null => {
    const codes: readonly string[] = REGIONS[rg];
    const vals = report.branches.filter((b) => codes.includes(b.branch)).map(pick).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };

  const allRegions = (Object.keys(REGIONS) as RegionName[]).map((rg) => ({
    region: rg,
    totalRevenue: regionSum(rg, (b) => b.totalRevenueStreamMtd),
  }));
  const sortedByRevenue = [...allRegions]
    .filter((r): r is { region: RegionName; totalRevenue: number } => r.totalRevenue !== null)
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
  const rankIdx = sortedByRevenue.findIndex((r) => r.region === region);

  const d = new Date(`${date}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m0 = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const workingDays = {
    elapsed: countWorkingDays(y, m0, d.getUTCDate(), shared.holidays),
    total: countWorkingDays(y, m0, lastDay, shared.holidays),
  };
  const totalRevenue = regionSum(region, (b) => b.totalRevenueStreamMtd);
  const vasActual = regionSum(region, (b) => b.vasAchievementForTheMonth);
  const vasTarget = regionSum(region, (b) => b.vasBillTarget);

  return {
    rollup: {
      region,
      totalRevenue,
      vasActual,
      vasTarget,
      vasPct: vasActual !== null && vasTarget ? vasActual / vasTarget : null,
      workingDays,
      projectedTotalRevenue:
        totalRevenue !== null && workingDays.elapsed > 0 ? (totalRevenue / workingDays.elapsed) * workingDays.total : null,
      rank: { rank: rankIdx === -1 ? sortedByRevenue.length + 1 : rankIdx + 1, of: allRegions.length },
      allRegions,
    },
    branches,
  };
}
