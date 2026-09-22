"use client";

import { Fragment, useMemo, useState } from "react";
import type { BranchReport } from "@/lib/report";
import { achievementRatio, achievementTone, hasActualWithoutTarget, type AchievementTone } from "@/lib/aggregate";
import { expectedProgressRatio, paceTone as computePaceTone, paceRatio } from "@/lib/pace";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import { computeTrendSeries, type TrendPoint } from "@/lib/trend";
import type { Snapshot } from "@/lib/snapshot-store";
import type { BaToolBranchRow } from "@/lib/ba-tool/parse";
import { Sparkline } from "@/components/sparkline";
import { useSyncedMetric } from "./metric-sync";

export type HeatmapMetricConfig = {
  label: string;
  actual: keyof BranchReport;
  target: keyof BranchReport | number;
  /** Shared-metric-selector key (metric-sync.tsx) — when set and the page
   * wraps this component in a <MetricSyncProvider>, the shared dropdown
   * sorts the heatmap by this column (2026-09-19, at the user's request).
   * Omit for a metric that isn't part of the shared selection (e.g. the main
   * Dashboard's VAS/T-Gloss columns, which have no shared dropdown at all). */
  syncKey?: string;
  /** Raw BA Tool fields for this metric's trend line — only needed for the
   * branch-drilldown sparkline (paceMode only). Omit to skip the sparkline
   * in the drilldown without affecting anything else. */
  baToolActual?: keyof BaToolBranchRow;
  baToolTarget?: keyof BaToolBranchRow;
};

/** BPU/Offtake/Parts Retail/PM+OC moved to their own heatmap on the TKM
 * Targets page (2026-08-31) — this default is what's left on the main
 * dashboard's heatmap. The T-Gloss (penetration %) column was dropped
 * 2026-09-21, at the user's request, and VAS relabeled to "TGloss Revenue"
 * — same figures (vasAchievementForTheMonth vs vasBillTarget), name only. */
const DEFAULT_METRICS: HeatmapMetricConfig[] = [
  { label: "TGloss Revenue", actual: "vasAchievementForTheMonth", target: "vasBillTarget" },
];

const CELL_BG: Record<AchievementTone, string> = {
  good: "bg-good-solid text-on-accent",
  warn: "bg-warn-solid text-on-accent",
  critical: "bg-bad-solid text-on-accent",
  neutral: "bg-surface-2 text-fg-faint",
};

/** A real figure with no target to grade it against (e.g. CO01C's online
 * Offtake) gets its own sky-blue treatment, not the same grey "—" as a
 * genuinely empty cell — otherwise real activity is invisible until someone
 * happens to hover. */
const NO_TARGET_ACTIVITY_BG = "bg-info-soft text-info";

const LEGEND_ITEMS: { tone: AchievementTone; label: string }[] = [
  { tone: "good", label: "On/above expected pace" },
  { tone: "warn", label: "Slightly behind pace" },
  { tone: "critical", label: "Materially behind pace" },
  { tone: "neutral", label: "No target" },
];

function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
  if (!direction) return <span className="inline-block w-2.5" aria-hidden="true" />;
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden="true">
      <path
        d={direction === "asc" ? "M2 6.5 L5 3 L8 6.5" : "M2 3.5 L5 7 L8 3.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A cell's value is always the full-period ratio (actual ÷ full target) —
 * never changed by pace mode. Only the COLOUR switches: plain achievementTone
 * (ratio vs. 100% of the full-month target) normally, or — when `date` is
 * given (pace mode) — paceTone (ratio vs. expected progress as of `date`),
 * so the grid doesn't read almost-uniformly red at mid-month just because
 * the month isn't over yet (2026-09-19, at the user's request). A cell with
 * a real actual but no target always shows "No target" text, never a raw
 * number standing in for a percentage — the actual is preserved in the
 * tooltip only. */
function MetricCell({
  actual,
  target,
  label,
  branch,
  date,
}: {
  actual: number | null;
  target: number | null;
  label: string;
  branch: string;
  date?: string;
}) {
  const ratio = achievementRatio(actual, target);
  const tone = date ? computePaceTone(date, actual, target) : achievementTone(ratio);
  const activityOnly = hasActualWithoutTarget(actual, target);

  let tooltip: string;
  if (activityOnly) {
    tooltip = `${branch} — ${label}: ${formatNumber(actual)} (no target set)`;
  } else if (date && ratio !== null) {
    const expected = expectedProgressRatio(date);
    tooltip = `${branch} — ${label}: ${formatNumber(actual)} of ${formatNumber(target)} target (${formatPercent(ratio)} of full target; expected ${formatPercent(expected)} by today)`;
  } else {
    tooltip = `${branch} — ${label}: ${formatNumber(actual)} of ${formatNumber(target)} target (${formatPercent(ratio)})`;
  }

  return (
    <div
      className={`flex h-8 w-28 items-center justify-center rounded font-semibold tabular-nums ${activityOnly ? NO_TARGET_ACTIVITY_BG : CELL_BG[tone]}`}
      title={tooltip}
    >
      {ratio !== null ? formatPercent(ratio) : activityOnly ? (date ? "No target" : formatCompact(actual)) : "—"}
    </div>
  );
}

function ExpandIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
      <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One metric's row inside a branch's drilldown panel — Actual / Target /
 * Gap / Expected-by-date / Final gap, plus a tiny trend line when the caller
 * supplied raw BA Tool fields for it. */
function DrilldownMetricRow({
  metric,
  actual,
  target,
  date,
  series,
}: {
  metric: HeatmapMetricConfig;
  actual: number | null;
  target: number | null;
  date: string;
  series: TrendPoint[] | null;
}) {
  const ratio = achievementRatio(actual, target);
  const expected = expectedProgressRatio(date);
  const pRatio = paceRatio(date, actual, target);
  const gap = actual !== null && target !== null ? target - actual : null;
  const expectedByNow = target !== null ? target * expected : null;
  const gapToExpected = actual !== null && expectedByNow !== null ? expectedByNow - actual : null;

  return (
    <div className="rounded-md border border-border-subtle bg-surface-2 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-fg-subtle">{metric.label}</span>
        {series && series.filter((p) => p.actual !== null).length >= 2 ? (
          <div className="w-16"><Sparkline values={series.map((p) => p.actual)} /></div>
        ) : null}
      </div>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">
        <div className="flex justify-between"><dt className="text-fg-faint">Actual</dt><dd className="font-medium tabular-nums text-fg">{target === null && actual === null ? "—" : formatNumber(actual)}</dd></div>
        <div className="flex justify-between"><dt className="text-fg-faint">Target</dt><dd className="font-medium tabular-nums text-fg">{target === null ? "No target" : formatNumber(target)}</dd></div>
        <div className="flex justify-between"><dt className="text-fg-faint">Achievement</dt><dd className="font-medium tabular-nums text-fg">{ratio === null ? "—" : formatPercent(ratio)}</dd></div>
        <div className="flex justify-between"><dt className="text-fg-faint">Expected by today</dt><dd className="font-medium tabular-nums text-fg">{expectedByNow === null ? "—" : formatNumber(expectedByNow)}</dd></div>
        <div className="flex justify-between"><dt className="text-fg-faint">Gap to expected</dt><dd className={`font-medium tabular-nums ${gapToExpected !== null && gapToExpected > 0 ? "text-bad" : "text-good"}`}>{gapToExpected === null ? "—" : formatNumber(gapToExpected)}</dd></div>
        <div className="flex justify-between"><dt className="text-fg-faint">Final target gap</dt><dd className={`font-medium tabular-nums ${gap !== null && gap > 0 ? "text-bad" : "text-good"}`}>{gap === null ? "—" : formatNumber(gap)}</dd></div>
      </dl>
      {pRatio !== null ? (
        <div className="mt-1.5 text-[10px] text-fg-faint">
          Pace: <span className="font-medium text-fg-muted">{formatPercent(pRatio)}</span> of expected progress
        </div>
      ) : null}
    </div>
  );
}

/** Every branch × every tracked KPI in one grid, each cell colored by the
 * same tone logic as everywhere else on the dashboard — the "everything at
 * a glance" view a single metric-at-a-time bar list can't give you.
 *
 * A branch that absorbed an online-store code (CO01A + CO01C) shows one
 * combined row like everything else on the dashboard, but its Offtake cell
 * — the only metric CO01C actually contributes to — gets a small expand
 * toggle. Opening it inserts a sub-row splitting the physical-store and
 * online-store figures back apart; the other metric columns on that sub-row
 * stay blank since CO01C has no data there to show.
 *
 * `date` is optional and switches on "pace mode" (2026-09-19, at the user's
 * request — the TKM Targets page): sortable columns, a colour legend, a
 * click-to-drilldown detail panel per branch, and pace-based (rather than
 * plain full-month) cell colouring. Omitting `date` keeps the component
 * pixel-identical to before this feature existed — the main Dashboard and
 * /branches pages don't pass it. */
export function BranchPerformanceHeatmap({
  branches,
  metrics = DEFAULT_METRICS,
  date,
  monthSnapshots,
}: {
  branches: BranchReport[];
  /** Defaults to the main dashboard's own set (VAS + T-Gloss); the TKM Targets page passes its BPU/Offtake/Parts Retail/PM+OC metrics instead. */
  metrics?: HeatmapMetricConfig[];
  /** Opts into pace mode — see doc comment above. */
  date?: string;
  /** Only used for the drilldown sparkline (paceMode only, and only for metrics that set baToolActual/baToolTarget). Omit to skip sparklines. */
  monthSnapshots?: Snapshot[];
}) {
  const paceMode = Boolean(date);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drilldownBranch, setDrilldownBranch] = useState<string | null>(null);
  const [manualSort, setManualSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  // Hooks must run unconditionally regardless of paceMode (Rules of Hooks) —
  // the shared-metric value is simply ignored below when paceMode is off.
  const [sharedMetricRaw] = useSyncedMetricSafe();
  const sharedMetric = paceMode ? sharedMetricRaw : null;
  const offtakeColumnIndex = metrics.findIndex((m) => m.label === "Offtake");

  // Sort priority: an explicit header click wins; otherwise, in pace mode,
  // the shared KPI selector (Trend/Region Scorecard) sorts worst-pace-first
  // so picking a metric there also re-ranks the heatmap by it — confirmed
  // with the user 2026-09-19. Outside pace mode (main Dashboard/Branches),
  // rows stay branch-alphabetical exactly as before.
  const activeSort = useMemo(
    () => manualSort ?? (paceMode && sharedMetric ? { key: sharedMetric, direction: "asc" as const } : null),
    [manualSort, paceMode, sharedMetric]
  );
  const sortMetric = activeSort ? metrics.find((m) => (m.syncKey ?? m.label) === activeSort.key) : null;

  const rows = useMemo(() => {
    const list = [...branches];
    if (!sortMetric) {
      list.sort((a, b) => a.branch.localeCompare(b.branch));
      return list;
    }
    const rank = (b: BranchReport) => {
      const actual = b[sortMetric.actual] as number | null;
      const target = typeof sortMetric.target === "number" ? sortMetric.target : (b[sortMetric.target] as number | null);
      const r = date ? paceRatio(date, actual, target) : achievementRatio(actual, target);
      // No-target/no-data branches sort last regardless of direction — a
      // missing ratio isn't "worse" or "better," it's just not comparable.
      return r;
    };
    list.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra === null && rb === null) return a.branch.localeCompare(b.branch);
      if (ra === null) return 1;
      if (rb === null) return -1;
      return activeSort!.direction === "asc" ? ra - rb : rb - ra;
    });
    return list;
  }, [branches, sortMetric, activeSort, date]);

  const toggle = (branch: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(branch)) next.delete(branch);
      else next.add(branch);
      return next;
    });
  };

  const handleHeaderClick = (metric: HeatmapMetricConfig) => {
    if (!paceMode) return;
    const key = metric.syncKey ?? metric.label;
    setManualSort((prev) => {
      if (prev?.key === key) return prev.direction === "asc" ? { key, direction: "desc" } : null;
      return { key, direction: "asc" };
    });
  };

  // The card itself, not just the table, was filling the full grid-cell
  // width regardless of how few metric columns it actually had — capping
  // it here (not just shrinking the table inside) is what removes the
  // empty space to the right with 1-2 metrics.
  const compactCard = metrics.length <= 2;

  return (
    <div className={`rounded-lg border border-border bg-surface p-4 shadow-card ${compactCard ? "inline-block" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Branch Performance Heatmap — Achievement %</h2>
        {paceMode ? (
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-fg-faint">
            {LEGEND_ITEMS.map((item) => (
              <span key={item.tone} className="inline-flex items-center gap-1">
                <span className={`h-2.5 w-2.5 rounded-sm ${CELL_BG[item.tone].split(" ")[0]}`} />
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-3 max-h-[420px] overflow-auto">
        {/* Metric columns stretch to fill a `w-full` table — fine with 4
            columns (TKM Targets), but with just 1 or 2 (the main dashboard's
            default, since T-Gloss was dropped 2026-09-21) that stretched a
            single achievement cell into one giant bar per row. Below that
            threshold the table shrinks to its content instead. */}
        <table className={`border-separate border-spacing-1 text-xs ${metrics.length <= 2 ? "w-auto" : "w-full min-w-[560px]"}`}>
          <thead className={paceMode ? "sticky top-0 z-10 bg-surface" : undefined}>
            <tr>
              <th className="w-24 pb-1 text-left text-[11px] font-medium text-fg-faint">Branch</th>
              {metrics.map((m) => {
                const key = m.syncKey ?? m.label;
                const direction = activeSort?.key === key ? activeSort.direction : null;
                return (
                  <th key={m.label} className="pb-1 text-center text-[11px] font-medium text-fg-faint">
                    {paceMode ? (
                      <button
                        type="button"
                        onClick={() => handleHeaderClick(m)}
                        className="inline-flex items-center gap-1 hover:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        title={`Sort by ${m.label}`}
                      >
                        {m.label}
                        <SortIcon direction={direction} />
                      </button>
                    ) : (
                      m.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const breakdown = b.onlineStoreBreakdown;
              const isOpen = breakdown ? expanded.has(b.branch) : false;
              const isDrilldownOpen = drilldownBranch === b.branch;
              return (
                <Fragment key={b.branch}>
                  <tr>
                    <td className="whitespace-nowrap py-0.5 pr-2 text-right font-medium text-fg-muted">
                      <span className="inline-flex items-center gap-1">
                        {breakdown ? (
                          <button
                            type="button"
                            onClick={() => toggle(b.branch)}
                            className="inline-flex items-center gap-1 rounded hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            title={`${b.branch} includes ${breakdown.onlineBranchCode} (online store) — click to split Offtake back apart`}
                          >
                            <ExpandIcon open={isOpen} />
                          </button>
                        ) : null}
                        {paceMode ? (
                          <button
                            type="button"
                            onClick={() => setDrilldownBranch(isDrilldownOpen ? null : b.branch)}
                            className="rounded hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            title={`${b.branch} — click for detail`}
                          >
                            {b.branch}
                          </button>
                        ) : (
                          b.branch
                        )}
                      </span>
                    </td>
                    {metrics.map((m) => {
                      const actual = b[m.actual] as number | null;
                      const target = typeof m.target === "number" ? m.target : (b[m.target] as number | null);
                      return (
                        <td key={m.label} className="p-0">
                          <MetricCell actual={actual} target={target} label={m.label} branch={b.branch} date={date} />
                        </td>
                      );
                    })}
                  </tr>
                  {breakdown && isOpen ? (
                    <>
                      <tr key={`${b.branch}-own`} className="text-[11px] text-fg-faint">
                        <td className="whitespace-nowrap py-0.5 pr-2 text-right">└ {b.branch} (physical)</td>
                        {metrics.map((m, i) =>
                          i === offtakeColumnIndex ? (
                            <td key={m.label} className="p-0">
                              <MetricCell actual={breakdown.ownOfftake} target={breakdown.ownOfftakeTarget} label={`${m.label} (physical)`} branch={b.branch} date={date} />
                            </td>
                          ) : (
                            <td key={m.label} className="p-0">
                              <div className="flex h-8 items-center justify-center rounded bg-surface-2 text-fg-faint">—</div>
                            </td>
                          )
                        )}
                      </tr>
                      <tr key={`${b.branch}-online`} className="text-[11px] text-fg-faint">
                        <td className="whitespace-nowrap py-0.5 pr-2 text-right">└ {breakdown.onlineBranchCode} (online)</td>
                        {metrics.map((m, i) =>
                          i === offtakeColumnIndex ? (
                            <td key={m.label} className="p-0">
                              <MetricCell
                                actual={breakdown.onlineOfftake}
                                target={breakdown.onlineOfftakeTarget}
                                label={`${m.label} (online)`}
                                branch={breakdown.onlineBranchCode}
                                date={date}
                              />
                            </td>
                          ) : (
                            <td key={m.label} className="p-0">
                              <div className="flex h-8 items-center justify-center rounded bg-surface-2 text-fg-faint">—</div>
                            </td>
                          )
                        )}
                      </tr>
                    </>
                  ) : null}
                  {paceMode && isDrilldownOpen && date ? (
                    <tr>
                      <td colSpan={metrics.length + 1} className="p-0">
                        <div className="my-1 grid grid-cols-1 gap-2 rounded-lg border border-border-subtle bg-surface p-3 sm:grid-cols-2 xl:grid-cols-4">
                          {metrics.map((m) => (
                            <DrilldownMetricRow
                              key={m.label}
                              metric={m}
                              actual={b[m.actual] as number | null}
                              target={typeof m.target === "number" ? m.target : (b[m.target] as number | null)}
                              date={date}
                              series={
                                monthSnapshots && m.baToolActual
                                  ? computeTrendSeries(monthSnapshots, "All", m.baToolActual, m.baToolTarget, "sum", b.branch)
                                  : null
                              }
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Reads the shared metric selector when a MetricSyncProvider is present,
 * without crashing when it isn't (the main Dashboard's heatmap doesn't
 * expect one, and heatmap-only pace mode without a provider should just
 * fall back to no shared-sort influence). useSyncedMetric already does this
 * fallback internally via useContext, so this is a thin typed wrapper. */
function useSyncedMetricSafe(): [string | null, (v: string) => void] {
  const [metric, setMetric] = useSyncedMetric("");
  return [metric || null, setMetric];
}
