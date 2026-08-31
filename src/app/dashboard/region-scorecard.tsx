"use client";

import { useState } from "react";
import { achievementRatio, achievementTone, computeKpiSummary, filterBranchesByRegion, hasActualWithoutTarget, type AchievementTone } from "@/lib/aggregate";
import { formatCompact, formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import { computePace } from "@/lib/pace";
import { computeTrendSeries, computeVasTrendSeries, type TrendPoint } from "@/lib/trend";
import type { BranchReport } from "@/lib/report";
import { REGIONS, type RegionName } from "@/lib/regions";
import type { Snapshot } from "@/lib/snapshot-store";
import type { ServiceInfoSnapshot } from "@/lib/service-info/store";
import { Sparkline } from "@/components/sparkline";

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

const REGION_ACCENT: Record<RegionName, string> = { Central: "#2a78d6", South: "#eb6834", North: "#1baf7a" };
const TONE_TEXT: Record<AchievementTone, string> = {
  good: "text-emerald-700",
  warn: "text-amber-700",
  critical: "text-red-700",
  neutral: "text-slate-400",
};

function ExpandIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
      <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One "└ CO01A (physical): 98.4%" / "└ CO01C (online): 1,287" line — same
 * split-back-apart math as the heatmap, Alerts panel, and Branch
 * Performance bars. */
function BreakdownLine({ label, actual, target }: { label: string; actual: number | null; target: number | null }) {
  const ratio = achievementRatio(actual, target);
  const activityOnly = hasActualWithoutTarget(actual, target);
  const display = ratio !== null ? formatPercent(ratio) : activityOnly ? formatCompact(actual) : "—";
  return (
    <div className="pl-3 text-[10px] text-slate-400">
      └ {label} <span className={`font-medium ${activityOnly ? "text-sky-700" : "text-slate-500"}`}>{display}</span>
    </div>
  );
}

function RegionCard({
  region,
  branches,
  series,
  date,
  metricActual,
  metricTarget,
  formatValue,
}: {
  region: RegionName;
  branches: BranchReport[];
  series: TrendPoint[];
  date: string;
  metricActual: keyof BranchReport;
  metricTarget: keyof BranchReport;
  formatValue: (v: number | null) => string;
}) {
  const [openRole, setOpenRole] = useState<"best" | "weakest" | null>(null);

  const regionBranches = filterBranchesByRegion(branches, region);
  const kpis = computeKpiSummary(regionBranches);
  const actual = kpis[metricActual as keyof typeof kpis] as number | null;
  const target = kpis[metricTarget as keyof typeof kpis] as number | null;
  const ratio = achievementRatio(actual, target);
  const tone = achievementTone(ratio);
  const pace = computePace(date, actual, target);

  const ranked = regionBranches
    .map((b) => ({ branch: b.branch, ratio: achievementRatio(b[metricActual] as number | null, b[metricTarget] as number | null) }))
    .filter((r): r is { branch: string; ratio: number } => r.ratio !== null)
    .sort((a, b) => b.ratio - a.ratio);
  const best = ranked[0];
  const weakest = ranked[ranked.length - 1];

  // Offtake is the only metric an online-store code (CO01C) contributes
  // to, so the expand-to-split option only makes sense when that's the
  // metric currently selected.
  const isOfftakeMetric = metricActual === "offtakeAchievementForTheMonth";
  const bestBreakdown = isOfftakeMetric ? regionBranches.find((b) => b.branch === best?.branch)?.onlineStoreBreakdown : undefined;
  const weakestBreakdown = isOfftakeMetric ? regionBranches.find((b) => b.branch === weakest?.branch)?.onlineStoreBreakdown : undefined;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: REGION_ACCENT[region] }}>
        <span className="h-2 w-2 rounded-full" style={{ background: REGION_ACCENT[region] }} />
        {region}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${TONE_TEXT[tone]}`}>{formatValue(actual)}</div>
      <div className={`text-[11px] font-medium ${TONE_TEXT[tone]}`}>{ratio === null ? "no target set" : `${formatPercent(ratio)} of target`}</div>

      {series.length >= 2 ? <div className="mt-2"><Sparkline values={series.map((p) => p.actual)} color={REGION_ACCENT[region]} /></div> : null}

      <div className="mt-2 space-y-0.5 text-[10px] text-slate-400">
        {pace.gap !== null && pace.gap > 0 ? (
          <div>
            Gap <span className="font-medium text-slate-600">{formatValue(pace.gap)}</span>
          </div>
        ) : pace.gap !== null ? (
          <div className="text-emerald-600">Target already met</div>
        ) : null}
        {pace.runRatePerDay !== null ? (
          <div>
            Run rate <span className="font-medium text-slate-600">{formatValue(pace.runRatePerDay)}/day</span>
          </div>
        ) : null}
        {pace.gap !== null && pace.gap > 0 && pace.requiredRatePerDay !== null ? (
          <div>
            Required <span className="font-medium text-slate-600">{formatValue(pace.requiredRatePerDay)}/day</span>
          </div>
        ) : null}
      </div>

      <div className="mt-2 space-y-0.5 border-t border-dashed border-slate-200 pt-2 text-[10px]">
        {best ? (
          <div>
            <div className="text-slate-500">
              Best branch <span className="font-medium text-emerald-700">{best.branch}</span>{" "}
              <span className="text-slate-400">({formatPercent(best.ratio)})</span>
              {bestBreakdown ? (
                <button
                  type="button"
                  onClick={() => setOpenRole((r) => (r === "best" ? null : "best"))}
                  className="ml-1 inline-flex items-center rounded text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  title={`${best.branch} includes ${bestBreakdown.onlineBranchCode} (online store) — click to split Offtake back apart`}
                >
                  <ExpandIcon open={openRole === "best"} />
                </button>
              ) : null}
            </div>
            {bestBreakdown && openRole === "best" ? (
              <div className="mt-0.5 space-y-0.5">
                <BreakdownLine label={`${best.branch} (physical)`} actual={bestBreakdown.ownOfftake} target={bestBreakdown.ownOfftakeTarget} />
                <BreakdownLine label={`${bestBreakdown.onlineBranchCode} (online)`} actual={bestBreakdown.onlineOfftake} target={bestBreakdown.onlineOfftakeTarget} />
              </div>
            ) : null}
          </div>
        ) : null}
        {weakest && weakest.branch !== best?.branch ? (
          <div>
            <div className="text-slate-500">
              Weakest branch <span className="font-medium text-red-700">{weakest.branch}</span>{" "}
              <span className="text-slate-400">({formatPercent(weakest.ratio)})</span>
              {weakestBreakdown ? (
                <button
                  type="button"
                  onClick={() => setOpenRole((r) => (r === "weakest" ? null : "weakest"))}
                  className="ml-1 inline-flex items-center rounded text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  title={`${weakest.branch} includes ${weakestBreakdown.onlineBranchCode} (online store) — click to split Offtake back apart`}
                >
                  <ExpandIcon open={openRole === "weakest"} />
                </button>
              ) : null}
            </div>
            {weakestBreakdown && openRole === "weakest" ? (
              <div className="mt-0.5 space-y-0.5">
                <BreakdownLine label={`${weakest.branch} (physical)`} actual={weakestBreakdown.ownOfftake} target={weakestBreakdown.ownOfftakeTarget} />
                <BreakdownLine label={`${weakestBreakdown.onlineBranchCode} (online)`} actual={weakestBreakdown.onlineOfftake} target={weakestBreakdown.onlineOfftakeTarget} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Central/South/North side by side for one Rs-or-unit metric at a time —
 * achievement-focused (gap/pace/best-weakest), complementing the Total
 * Revenue Stream panel's raw-figure view of the same regions. */
export function RegionScorecard({
  branches,
  monthSnapshots,
  serviceInfoMonthSnapshots = [],
  date,
  metrics = DEFAULT_METRICS,
}: {
  branches: BranchReport[];
  monthSnapshots: Snapshot[];
  /** Only needed for the "vas" metric's sparkline (see computeVasTrendSeries below) — omit entirely when `metrics` doesn't include it, e.g. the TKM Targets page. */
  serviceInfoMonthSnapshots?: ServiceInfoSnapshot[];
  date: string;
  /** Defaults to the main dashboard's own set (VAS only); the TKM Targets page passes its BPU/Offtake/Parts Retail/PM+OC metrics instead. */
  metrics?: RegionMetricConfig[];
}) {
  const [metric, setMetric] = useState<string>(metrics[0]?.key ?? "");
  const config = metrics.find((m) => m.key === metric) ?? metrics[0];

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Region Scorecard — MTD{metrics.length === 1 ? ` — ${metrics[0].label}` : ""}
        </h2>
        {metrics.length > 1 ? (
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="h-7 rounded border border-slate-300 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
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
            date={date}
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
