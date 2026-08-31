"use client";

import { Fragment, useState } from "react";
import type { BranchReport } from "@/lib/report";
import { achievementRatio, achievementTone, hasActualWithoutTarget, type AchievementTone } from "@/lib/aggregate";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";

export type HeatmapMetricConfig = { label: string; actual: keyof BranchReport; target: keyof BranchReport | number };

/** BPU/Offtake/Parts Retail/PM+OC moved to their own heatmap on the TKM
 * Targets page (2026-08-31) — this default is what's left on the main
 * dashboard's heatmap. */
const DEFAULT_METRICS: HeatmapMetricConfig[] = [
  { label: "VAS", actual: "vasAchievementForTheMonth", target: "vasBillTarget" },
  { label: "T-Gloss", actual: "penetrationTGlossService", target: 0.38 },
];

const CELL_BG: Record<AchievementTone, string> = {
  good: "bg-emerald-500 text-white",
  warn: "bg-amber-400 text-white",
  critical: "bg-red-500 text-white",
  neutral: "bg-slate-100 text-slate-400",
};

/** A real figure with no target to grade it against (e.g. CO01C's online
 * Offtake) gets its own sky-blue treatment, not the same grey "—" as a
 * genuinely empty cell — otherwise real activity is invisible until someone
 * happens to hover. */
const NO_TARGET_ACTIVITY_BG = "bg-sky-50 text-sky-700";

function MetricCell({ actual, target, label, branch }: { actual: number | null; target: number | null; label: string; branch: string }) {
  const ratio = achievementRatio(actual, target);
  const tone = achievementTone(ratio);
  const activityOnly = hasActualWithoutTarget(actual, target);
  const tooltip = activityOnly
    ? `${branch} — ${label}: ${formatNumber(actual)} (no target set)`
    : `${branch} — ${label}: ${formatNumber(actual)} of ${formatNumber(target)} target (${formatPercent(ratio)})`;
  return (
    <div
      className={`flex h-8 items-center justify-center rounded font-semibold tabular-nums ${activityOnly ? NO_TARGET_ACTIVITY_BG : CELL_BG[tone]}`}
      title={tooltip}
    >
      {ratio !== null ? formatPercent(ratio) : activityOnly ? formatCompact(actual) : "—"}
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

/** Every branch × every tracked KPI in one grid, each cell colored by the
 * same tone logic as everywhere else on the dashboard — the "everything at
 * a glance" view a single metric-at-a-time bar list can't give you.
 *
 * A branch that absorbed an online-store code (CO01A + CO01C) shows one
 * combined row like everything else on the dashboard, but its Offtake cell
 * — the only metric CO01C actually contributes to — gets a small expand
 * toggle. Opening it inserts a sub-row splitting the physical-store and
 * online-store figures back apart; the other metric columns on that sub-row
 * stay blank since CO01C has no data there to show. */
export function BranchPerformanceHeatmap({
  branches,
  metrics = DEFAULT_METRICS,
}: {
  branches: BranchReport[];
  /** Defaults to the main dashboard's own set (VAS + T-Gloss); the TKM Targets page passes its BPU/Offtake/Parts Retail/PM+OC metrics instead. */
  metrics?: HeatmapMetricConfig[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rows = [...branches].sort((a, b) => a.branch.localeCompare(b.branch));
  const offtakeColumnIndex = metrics.findIndex((m) => m.label === "Offtake");

  const toggle = (branch: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(branch)) next.delete(branch);
      else next.add(branch);
      return next;
    });
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Branch Performance Heatmap — Achievement %</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="w-24 pb-1 text-left text-[11px] font-medium text-slate-400">Branch</th>
              {metrics.map((m) => (
                <th key={m.label} className="pb-1 text-center text-[11px] font-medium text-slate-400">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const breakdown = b.onlineStoreBreakdown;
              const isOpen = breakdown ? expanded.has(b.branch) : false;
              return (
                <Fragment key={b.branch}>
                  <tr>
                    <td className="whitespace-nowrap py-0.5 pr-2 text-right font-medium text-slate-700">
                      {breakdown ? (
                        <button
                          type="button"
                          onClick={() => toggle(b.branch)}
                          className="inline-flex items-center gap-1 rounded hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                          title={`${b.branch} includes ${breakdown.onlineBranchCode} (online store) — click to split Offtake back apart`}
                        >
                          <ExpandIcon open={isOpen} />
                          {b.branch}
                        </button>
                      ) : (
                        b.branch
                      )}
                    </td>
                    {metrics.map((m) => {
                      const actual = b[m.actual] as number | null;
                      const target = typeof m.target === "number" ? m.target : (b[m.target] as number | null);
                      return (
                        <td key={m.label} className="p-0">
                          <MetricCell actual={actual} target={target} label={m.label} branch={b.branch} />
                        </td>
                      );
                    })}
                  </tr>
                  {breakdown && isOpen ? (
                    <>
                      <tr key={`${b.branch}-own`} className="text-[11px] text-slate-400">
                        <td className="whitespace-nowrap py-0.5 pr-2 text-right">└ {b.branch} (physical)</td>
                        {metrics.map((m, i) =>
                          i === offtakeColumnIndex ? (
                            <td key={m.label} className="p-0">
                              <MetricCell actual={breakdown.ownOfftake} target={breakdown.ownOfftakeTarget} label={`${m.label} (physical)`} branch={b.branch} />
                            </td>
                          ) : (
                            <td key={m.label} className="p-0">
                              <div className="flex h-8 items-center justify-center rounded bg-slate-50 text-slate-300">—</div>
                            </td>
                          )
                        )}
                      </tr>
                      <tr key={`${b.branch}-online`} className="text-[11px] text-slate-400">
                        <td className="whitespace-nowrap py-0.5 pr-2 text-right">└ {breakdown.onlineBranchCode} (online)</td>
                        {metrics.map((m, i) =>
                          i === offtakeColumnIndex ? (
                            <td key={m.label} className="p-0">
                              <MetricCell
                                actual={breakdown.onlineOfftake}
                                target={breakdown.onlineOfftakeTarget}
                                label={`${m.label} (online)`}
                                branch={breakdown.onlineBranchCode}
                              />
                            </td>
                          ) : (
                            <td key={m.label} className="p-0">
                              <div className="flex h-8 items-center justify-center rounded bg-slate-50 text-slate-300">—</div>
                            </td>
                          )
                        )}
                      </tr>
                    </>
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
