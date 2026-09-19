"use client";

import { achievementRatio, achievementTone, computeKpiSummary, filterBranchesByRegion, type AchievementTone } from "@/lib/aggregate";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import { computeTrendSeries, computeVasTrendSeries, type TrendPoint } from "@/lib/trend";
import type { BranchReport } from "@/lib/report";
import { REGIONS, type RegionName } from "@/lib/regions";
import type { Snapshot } from "@/lib/snapshot-store";
import type { ServiceInfoSnapshot } from "@/lib/service-info/store";
import { Sparkline } from "@/components/sparkline";
import { useSyncedMetric } from "./metric-sync";

export type RegionMetricConfig = {
  key: string;
  label: string;
  actual: keyof ReturnType<typeof computeKpiSummary>;
  target: keyof ReturnType<typeof computeKpiSummary>;
  /** VAS has no single raw BA Tool field for either side of the sparkline series — its trend comes from computeVasTrendSeries instead (see below), so this is left unset. */
  baToolActual?: string;
  baToolTarget?: string;
  /** Rs-denominated metrics use compact crore/lakh notation; unit-count metrics (BPU, PM+OC) stay as plain counts. */
  isCurrency: boolean;
};

/** BPU/Offtake/Parts Retail/PM+OC moved to their own region scorecard on the
 * TKM Targets page (2026-08-31) — this default is what's left on the main
 * dashboard's scorecard. */
const DEFAULT_METRICS: RegionMetricConfig[] = [
  { key: "vas", label: "VAS (Rs)", actual: "vasAchievementForTheMonth", target: "vasBillTarget", isCurrency: true },
];

// Theme tokens, not raw hex — the dark palette lifts these for contrast on
// the near-black canvas (see globals.css). var() resolves fine in inline
// styles and SVG stroke/fill (same as trend-chart.tsx).
const REGION_ACCENT: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};
const TONE_TEXT: Record<AchievementTone, string> = {
  good: "text-good",
  warn: "text-warn",
  critical: "text-bad",
  neutral: "text-fg-faint",
};

/** Headline number + trend only (2026-09-15, at the user's request — the
 * pace/gap breakdown and the best/weakest branch drill-down were "stuff you
 * don't actually look at"). See git history for the fuller card if that
 * level of detail is ever wanted back. */
function RegionCard({
  region,
  branches,
  series,
  metricActual,
  metricTarget,
  formatValue,
}: {
  region: RegionName;
  branches: BranchReport[];
  series: TrendPoint[];
  metricActual: keyof BranchReport;
  metricTarget: keyof BranchReport;
  formatValue: (v: number | null) => string;
}) {
  const regionBranches = filterBranchesByRegion(branches, region);
  const kpis = computeKpiSummary(regionBranches);
  const actual = kpis[metricActual as keyof typeof kpis] as number | null;
  const target = kpis[metricTarget as keyof typeof kpis] as number | null;
  const ratio = achievementRatio(actual, target);
  const tone = achievementTone(ratio);

  return (
    <div className="rounded-lg border border-border bg-surface p-3.5 shadow-card">
      <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: REGION_ACCENT[region] }}>
        <span className="h-2 w-2 rounded-full" style={{ background: REGION_ACCENT[region] }} />
        {region}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${TONE_TEXT[tone]}`}>{formatValue(actual)}</div>
      <div className={`text-[11px] font-medium ${TONE_TEXT[tone]}`}>{ratio === null ? "no target set" : `${formatPercent(ratio)} of target`}</div>

      {series.length >= 2 ? <div className="mt-2"><Sparkline values={series.map((p) => p.actual)} color={REGION_ACCENT[region]} /></div> : null}
    </div>
  );
}

/** Central/South/North side by side for one Rs-or-unit metric at a time —
 * headline achievement + trend, complementing the Total Revenue Stream
 * panel's raw-figure view of the same regions. */
export function RegionScorecard({
  branches,
  monthSnapshots,
  serviceInfoMonthSnapshots = [],
  metrics = DEFAULT_METRICS,
}: {
  branches: BranchReport[];
  monthSnapshots: Snapshot[];
  /** Only needed for the "vas" metric's sparkline (see computeVasTrendSeries below) — omit entirely when `metrics` doesn't include it, e.g. the TKM Targets page. */
  serviceInfoMonthSnapshots?: ServiceInfoSnapshot[];
  /** Defaults to the main dashboard's own set (VAS only); the TKM Targets page passes its BPU/Offtake/Parts Retail/PM+OC metrics instead. */
  metrics?: RegionMetricConfig[];
}) {
  const [metric, setMetric] = useSyncedMetric(metrics[0]?.key ?? "");
  const config = metrics.find((m) => m.key === metric) ?? metrics[0];

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
          Region Scorecard — MTD{metrics.length === 1 ? ` — ${metrics[0].label}` : ""}
        </h2>
        {metrics.length > 1 ? (
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="h-7 rounded-md border border-border-strong px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(Object.keys(REGIONS) as RegionName[]).map((region) => (
          <RegionCard
            key={region}
            region={region}
            branches={branches}
            metricActual={config.actual as keyof BranchReport}
            metricTarget={config.target as keyof BranchReport}
            series={
              config.key === "vas"
                ? computeVasTrendSeries(monthSnapshots, serviceInfoMonthSnapshots, region)
                : computeTrendSeries(monthSnapshots, region, config.baToolActual as never, config.baToolTarget as never)
            }
            formatValue={config.isCurrency ? formatCompactCurrency : formatNumber}
          />
        ))}
      </div>
    </div>
  );
}
