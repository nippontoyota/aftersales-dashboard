import { achievementRatio, achievementTone, TRACKED_KPIS, type KpiSummary, type TrackedKpi } from "@/lib/aggregate";
import { formatNumber, formatPercent } from "@/lib/format";
import { computePace } from "@/lib/pace";
import { REGIONS, type RegionName } from "@/lib/regions";
import type { BranchReport } from "@/lib/report";

function LightbulbIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M8 1.5a4 4 0 0 0-2.2 7.3c.4.3.7.8.7 1.3v.4h3v-.4c0-.5.3-1 .7-1.3A4 4 0 0 0 8 1.5z" strokeLinejoin="round" />
      <path d="M6.3 13h3.4M6.8 14.5h2.4" strokeLinecap="round" />
    </svg>
  );
}

type Insight = string;

export type RegionGapMetric = { actual: keyof BranchReport; target: keyof BranchReport; label: string };
type PerBranchMetric = { actual: keyof BranchReport; target: keyof BranchReport };

/** Defaults match the main dashboard's own remaining tracked KPIs (VAS +
 * T-Gloss) — the TKM Targets page passes its own BPU/Offtake/Parts
 * Retail/PM+OC versions of all three (2026-08-31). */
const DEFAULT_PER_BRANCH_METRICS: PerBranchMetric[] = [{ actual: "vasAchievementForTheMonth", target: "vasBillTarget" }];
const DEFAULT_REGION_GAP_METRIC: RegionGapMetric = { actual: "vasAchievementForTheMonth", target: "vasBillTarget", label: "VAS" };

/** Every sentence here is generated from real, already-computed numbers —
 * run-rate/gap (lib/pace.ts) and achievement ratios (lib/aggregate.ts) —
 * templated into plain English, not an AI summary and not invented. Any
 * insight whose inputs are missing is simply skipped rather than guessed. */
function buildInsights(
  kpis: KpiSummary,
  branches: BranchReport[],
  date: string,
  trackedKpis: TrackedKpi[],
  perBranchMetrics: PerBranchMetric[],
  regionGapMetric: RegionGapMetric
): Insight[] {
  const insights: Insight[] = [];

  const evaluated = trackedKpis.map((kpi) => {
    const actual = kpis[kpi.actual] as number | null;
    const target = typeof kpi.target === "number" ? kpi.target : (kpis[kpi.target] as number | null);
    const ratio = achievementRatio(actual, target);
    return { ...kpi, actual, target, ratio };
  });
  const withRatio = evaluated.filter((k): k is typeof k & { ratio: number } => k.ratio !== null);

  // 1) The single worst-off KPI, with its pace toward target.
  const worst = [...withRatio].sort((a, b) => a.ratio - b.ratio)[0];
  if (worst && worst.ratio < 1 && worst.key !== "tGloss") {
    const pace = computePace(date, worst.actual, worst.target);
    if (pace.gap !== null && pace.gap > 0 && pace.runRatePerDay !== null && pace.requiredRatePerDay !== null) {
      insights.push(
        `${worst.label} needs ${formatNumber(pace.gap)} more to reach target. Current run rate is ${formatNumber(pace.runRatePerDay)}/day vs ${formatNumber(pace.requiredRatePerDay)}/day required.`
      );
    }
  }

  // 2) Which KPI is furthest below the average of all tracked KPIs.
  if (withRatio.length >= 2) {
    const avg = withRatio.reduce((sum, k) => sum + k.ratio, 0) / withRatio.length;
    const belowAvg = [...withRatio].filter((k) => k.ratio < avg).sort((a, b) => a.ratio - b.ratio)[0];
    if (belowAvg) {
      insights.push(
        `${belowAvg.label} (${formatPercent(belowAvg.ratio)}) is below the average across tracked KPIs (${formatPercent(avg)}).`
      );
    }
  }

  // 3) Which region has the largest Rs gap on the region-gap metric (the largest confirmed Rs line with a real target for this page).
  const regionGaps = (Object.keys(REGIONS) as RegionName[]).map((region) => {
    const codes: readonly string[] = REGIONS[region];
    const inRegion = branches.filter((b) => codes.includes(b.branch));
    let actual = 0;
    let target = 0;
    let found = false;
    for (const b of inRegion) {
      const a = b[regionGapMetric.actual];
      if (typeof a === "number") {
        actual += a;
        found = true;
      }
      const t = b[regionGapMetric.target];
      if (typeof t === "number") target += t;
    }
    return { region, gap: found ? target - actual : null };
  });
  const worstRegion = regionGaps.filter((r): r is { region: RegionName; gap: number } => r.gap !== null && r.gap > 0).sort((a, b) => b.gap - a.gap)[0];
  if (worstRegion) {
    insights.push(`${worstRegion.region} region has the largest ${regionGapMetric.label} target gap (${formatNumber(worstRegion.gap)}).`);
  }

  // 4) How many branches are critically below target, averaged across this page's confirmed Rs/unit achievement metrics.
  let belowCount = 0;
  let consideredCount = 0;
  for (const b of branches) {
    const ratios = perBranchMetrics
      .map((m) => achievementRatio(b[m.actual] as number | null, b[m.target] as number | null))
      .filter((r): r is number => r !== null);
    if (ratios.length === 0) continue;
    consideredCount += 1;
    const avgRatio = ratios.reduce((a, r) => a + r, 0) / ratios.length;
    if (achievementTone(avgRatio) === "critical") belowCount += 1;
  }
  if (consideredCount > 0 && belowCount > 0) {
    insights.push(
      `${belowCount} of ${consideredCount} branches with target data (${formatPercent(belowCount / consideredCount)}) average below 90% across their tracked KPIs.`
    );
  }

  return insights;
}

export function InsightsPanel({
  kpis,
  branches,
  date,
  trackedKpis = TRACKED_KPIS,
  perBranchMetrics = DEFAULT_PER_BRANCH_METRICS,
  regionGapMetric = DEFAULT_REGION_GAP_METRIC,
}: {
  kpis: KpiSummary;
  branches: BranchReport[];
  date: string;
  /** Which KPIs to reason about — defaults to the main dashboard's own set (VAS + T-Gloss); the TKM Targets page passes TKM_TRACKED_KPIS instead. */
  trackedKpis?: TrackedKpi[];
  perBranchMetrics?: PerBranchMetric[];
  regionGapMetric?: RegionGapMetric;
}) {
  const insights = buildInsights(kpis, branches, date, trackedKpis, perBranchMetrics, regionGapMetric);

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Insights</h2>
      <p className="mt-0.5 text-[10px] text-slate-400">Generated from all-branch figures, regardless of the region filter above — not a forecast, not AI.</p>

      {insights.length === 0 ? (
        <div className="mt-3 text-xs text-slate-400">Nothing notable — every tracked KPI is on or near target.</div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {insights.map((text, i) => (
            <li key={i} className="flex items-start gap-2.5 text-xs text-slate-700">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <LightbulbIcon />
              </span>
              <span className="min-w-0 flex-1">{text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
