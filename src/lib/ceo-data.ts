import {
  aggregateBpUtilization,
  aggregateGsUtilization,
  BP_BAYS,
  bpBayUtilization,
  gsBayUtilization,
  GS_BAYS,
  type BayUtilization,
} from "./bay-capacity";
import { computeHeroSummary, filterBranchesByRegion, type HeroSummary } from "./aggregate";
import { REGIONS, type RegionName } from "./regions";
import { loadReportHolidaySet } from "./report-holidays/store";
import { workingDaysElapsedInMonth } from "./reporting-date";
import { buildReport, type BranchReport, type Report } from "./report";
import { computeTrendSeries } from "./trend";
import { listSnapshotDates, loadSnapshotsForMonthUpTo } from "./snapshot-store";

/**
 * The data foundation for the CEO executive view (/ceo). Company-wide only,
 * like /vp — no branch/region/publish gate. Distinct from vp-data.ts because
 * the headline metrics differ (bay utilization instead of VAS/SPO/PM), and
 * bay utilization needs the working-days-elapsed pacing that nothing else on
 * the dashboard computes yet.
 */

export type CeoUtilization = {
  gs: { utilizationPct: number; actualRoMtd: number; idealRoMtd: number } | null;
  bp: { utilizationPct: number; actualRoMtd: number; idealRoMtd: number } | null;
};

export type CeoBranchRow = {
  branch: BranchReport;
  gs: BayUtilization | null;
  bp: BayUtilization | null;
};

export type CeoRegionRollup = {
  region: RegionName;
  branches: CeoBranchRow[];
  hero: HeroSummary;
  utilization: CeoUtilization;
};

/** Rule-based callout — the worst-pacing bay-utilization line across regions
 * (Group excluded, since "which region" is the useful signal), named down to
 * its lowest branch. Null when nothing is meaningfully behind. */
export type CeoCallout = {
  region: RegionName;
  metric: "GS" | "BP";
  utilizationPct: number;
  worstBranch: { branch: string; utilizationPct: number } | null;
};

export type CeoData = {
  date: string;
  dates: string[];
  /** Null when no BA Tool report exists for `date` yet (a date without an
   * upload is pickable now — branches are backfilling from January onward —
   * so this is an expected, temporary state, not an error). Every field below
   * that's derived from `report` follows suit. */
  report: Report | null;
  workingDaysElapsed: number;
  group: { hero: HeroSummary; utilization: CeoUtilization } | null;
  regions: CeoRegionRollup[];
  revenueTrend: { date: string; actual: number | null }[];
  gsRoTrend: { date: string; actual: number | null }[];
  bpRoTrend: { date: string; actual: number | null }[];
  callout: CeoCallout | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Below this, a region/metric is "lagging enough to call out" — avoids
 * flagging noise on a day or two of normal variance. */
const CALLOUT_THRESHOLD = 0.85;

function rollupUtilization(branches: BranchReport[], workingDaysElapsed: number): CeoUtilization {
  return {
    gs: aggregateGsUtilization(branches.map((b) => ({ branch: b.branch, gusRoMtd: b.gusRoMtd })), workingDaysElapsed),
    bp: aggregateBpUtilization(branches.map((b) => ({ branch: b.branch, bpuRoMtd: b.bpuRoMtd })), workingDaysElapsed),
  };
}

function buildCallout(regions: CeoRegionRollup[]): CeoCallout | null {
  let worst: CeoCallout | null = null;
  for (const r of regions) {
    for (const metric of ["GS", "BP"] as const) {
      const agg = metric === "GS" ? r.utilization.gs : r.utilization.bp;
      if (!agg || agg.utilizationPct >= CALLOUT_THRESHOLD) continue;
      if (worst && worst.utilizationPct <= agg.utilizationPct) continue;
      const branchUtils = r.branches
        .map((b) => ({ branch: b.branch.branch, u: metric === "GS" ? b.gs : b.bp }))
        .filter((x): x is { branch: string; u: BayUtilization } => x.u !== null)
        .sort((a, b) => a.u.utilizationPct - b.u.utilizationPct);
      const worstBranch = branchUtils[0] ? { branch: branchUtils[0].branch, utilizationPct: branchUtils[0].u.utilizationPct } : null;
      worst = { region: r.region, metric, utilizationPct: agg.utilizationPct, worstBranch };
    }
  }
  return worst;
}

export async function loadCeoData(requestedDate?: string): Promise<CeoData | null> {
  const dates = await listSnapshotDates();
  if (dates.length === 0) return null;

  const date = requestedDate && DATE_RE.test(requestedDate) ? requestedDate : dates.at(-1)!;

  const [report, holidays, monthSnapshots] = await Promise.all([
    buildReport(date),
    loadReportHolidaySet(),
    loadSnapshotsForMonthUpTo(date),
  ]);
  if (!report) {
    return { date, dates, report: null, workingDaysElapsed: 0, group: null, regions: [], revenueTrend: [], gsRoTrend: [], bpRoTrend: [], callout: null };
  }

  const workingDaysElapsed = workingDaysElapsedInMonth(date, holidays);

  const regions: CeoRegionRollup[] = (Object.keys(REGIONS) as RegionName[]).map((region) => {
    const branches = filterBranchesByRegion(report.branches, region);
    const rows: CeoBranchRow[] = branches.map((branch) => ({
      branch,
      gs: GS_BAYS[branch.branch] ? gsBayUtilization(branch.branch, branch.gusRoMtd, workingDaysElapsed) : null,
      bp: BP_BAYS[branch.branch] ? bpBayUtilization(branch.branch, branch.bpuRoMtd, workingDaysElapsed) : null,
    }));
    return { region, branches: rows, hero: computeHeroSummary(branches), utilization: rollupUtilization(branches, workingDaysElapsed) };
  });

  const gsRoTrend = computeTrendSeries(monthSnapshots, "All", "gus").map((p) => ({ date: p.date, actual: p.actual }));
  const bpRoTrend = computeTrendSeries(monthSnapshots, "All", "bpus").map((p) => ({ date: p.date, actual: p.actual }));

  return {
    date,
    dates,
    report,
    workingDaysElapsed,
    group: { hero: computeHeroSummary(report.branches), utilization: rollupUtilization(report.branches, workingDaysElapsed) },
    regions,
    // Total Revenue has no single BA Tool column (it's GUS+BPU parts/labour +
    // external + scrap/oil, assembled in report.ts) — a real day-by-day trend
    // would mean re-running buildReport() once per day in the month, too
    // costly for a page load. Left empty until revenue is indexed per-day
    // directly; the UI shows the MTD number without a sparkline for now.
    revenueTrend: [],
    gsRoTrend,
    bpRoTrend,
    callout: buildCallout(regions),
  };
}
