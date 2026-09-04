"use client";

import { useMemo, useState } from "react";
import type { BranchReport, OnlineStoreBreakdown } from "@/lib/report";
import { achievementRatio, achievementTone, hasActualWithoutTarget, type AchievementTone } from "@/lib/aggregate";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";

export type BarsMetricConfig = { key: string; label: string; actual: keyof BranchReport; target: keyof BranchReport };

/** BPU/Offtake/Parts Retail/PM+OC moved to their own bars on the TKM
 * Targets page (2026-08-31) — this default is what's left on the main
 * dashboard's bars. */
const DEFAULT_METRICS: BarsMetricConfig[] = [{ key: "vas", label: "VAS (Rs)", actual: "vasAchievementForTheMonth", target: "vasBillTarget" }];

const TONE_BAR: Record<AchievementTone, string> = {
  good: "bg-good-solid",
  warn: "bg-warn-solid",
  critical: "bg-bad-solid",
  neutral: "bg-surface-3",
};
const TONE_TEXT: Record<AchievementTone, string> = {
  good: "text-good",
  warn: "text-warn",
  critical: "text-bad",
  neutral: "text-fg-faint",
};

const COLLAPSED_HEAD = 4;

type Ranked = {
  branch: string;
  ratio: number | null;
  actual: number | null;
  target: number | null;
  /** Only set when the metric is Offtake on a branch that absorbed an
   * online-store code (CO01A + CO01C) — offers the same expand-to-split
   * view the heatmap and Alerts panel have. */
  onlineStoreBreakdown?: OnlineStoreBreakdown;
};

function ExpandIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
      <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One "└ CO01A (physical): 98.4%" / "└ CO01C (online): 1,287" line — same
 * split-back-apart math as the heatmap and Alerts panel. */
function BreakdownLine({ label, actual, target }: { label: string; actual: number | null; target: number | null }) {
  const ratio = achievementRatio(actual, target);
  const activityOnly = hasActualWithoutTarget(actual, target);
  const display = ratio !== null ? formatPercent(ratio) : activityOnly ? formatCompact(actual) : "—";
  return (
    <div className="pl-6 text-[10px] text-fg-faint">
      └ {label} <span className={`font-medium ${activityOnly ? "text-info" : "text-fg-subtle"}`}>{display}</span>
    </div>
  );
}

function BarRow({
  rank,
  r,
  max,
  metricLabel,
  isOpen,
  onToggle,
}: {
  rank: number;
  r: Ranked;
  max: number;
  metricLabel: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const tone = achievementTone(r.ratio);
  const activityOnly = hasActualWithoutTarget(r.actual, r.target);
  const widthPct = r.ratio === null ? 0 : Math.min(100, Math.max(2, (r.ratio / max) * 100));
  const tooltip =
    r.ratio !== null
      ? `${r.branch} — ${metricLabel}: ${formatNumber(r.actual)} of ${formatNumber(r.target)} target (${formatPercent(r.ratio)})`
      : activityOnly
        ? `${r.branch} — ${metricLabel}: ${formatNumber(r.actual)} (no target set)`
        : `${r.branch} — ${metricLabel}: no target set`;
  const breakdown = r.onlineStoreBreakdown;
  return (
    <div>
      <div className="flex items-center gap-2 text-xs" title={tooltip}>
        <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-fg-faint">{rank}</span>
        <span className="flex w-14 shrink-0 items-center gap-0.5 truncate font-medium text-fg-muted">
          {r.branch}
          {breakdown ? (
            <button
              type="button"
              onClick={onToggle}
              className="shrink-0 rounded text-fg-faint hover:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              title={`${r.branch} includes ${breakdown.onlineBranchCode} (online store) — click to split ${metricLabel} back apart`}
            >
              <ExpandIcon open={isOpen} />
            </button>
          ) : null}
        </span>
        <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${activityOnly ? "bg-info-solid" : TONE_BAR[tone]}`} style={{ width: `${widthPct}%` }} />
        </div>
        <span className={`w-11 shrink-0 text-right font-semibold tabular-nums ${activityOnly ? "text-info" : TONE_TEXT[tone]}`}>
          {r.ratio !== null ? formatPercent(r.ratio) : activityOnly ? formatCompact(r.actual) : "—"}
        </span>
      </div>
      {breakdown && isOpen ? (
        <div className="mt-0.5 space-y-0.5">
          <BreakdownLine label={`${r.branch} (physical)`} actual={breakdown.ownOfftake} target={breakdown.ownOfftakeTarget} />
          <BreakdownLine label={`${breakdown.onlineBranchCode} (online)`} actual={breakdown.onlineOfftake} target={breakdown.onlineOfftakeTarget} />
        </div>
      ) : null}
    </div>
  );
}

/** Worst-first ranking (attention goes where it's needed), collapsed to the worst 4 + the single best performer for scale — matching the "Alerts" panel's same worst-first convention. "View all" reveals every branch in rank order. */
export function BranchPerformanceBars({
  branches,
  metrics = DEFAULT_METRICS,
  defaultExpanded = false,
}: {
  branches: BranchReport[];
  /** Defaults to the main dashboard's own set (VAS only); the TKM Targets page passes its BPU/Offtake/Parts Retail/PM+OC metrics instead. */
  metrics?: BarsMetricConfig[];
  /** Skip the worst-4-plus-best collapse and show every branch right away — the /branches page wants this fully expanded (2026-08-31). */
  defaultExpanded?: boolean;
}) {
  const [metric, setMetric] = useState<string>(metrics[0]?.key ?? "");
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openBreakdowns, setOpenBreakdowns] = useState<Set<string>>(new Set());
  const config = metrics.find((m) => m.key === metric) ?? metrics[0];

  const toggleBreakdown = (branch: string) => {
    setOpenBreakdowns((prev) => {
      const next = new Set(prev);
      if (next.has(branch)) next.delete(branch);
      else next.add(branch);
      return next;
    });
  };

  const ranked = useMemo<Ranked[]>(() => {
    return branches
      .map((b) => {
        const actual = b[config.actual] as number | null;
        const target = b[config.target] as number | null;
        return {
          branch: b.branch,
          ratio: achievementRatio(actual, target),
          actual,
          target,
          onlineStoreBreakdown: config.key === "offtake" ? b.onlineStoreBreakdown : undefined,
        };
      })
      .sort((a, b) => {
        if (a.ratio === null && b.ratio === null) return 0;
        if (a.ratio === null) return 1;
        if (b.ratio === null) return -1;
        return a.ratio - b.ratio;
      });
  }, [branches, config]);

  const max = Math.max(1, ...ranked.map((r) => r.ratio ?? 0));
  const showEllipsis = !expanded && ranked.length > COLLAPSED_HEAD + 1;
  const head = expanded ? ranked : ranked.slice(0, COLLAPSED_HEAD);
  // The single "best performer" preview row: the last entry with a real
  // ratio, not just the last entry in sort order — branches with no target
  // (null ratio) always sort last, so `ranked[length-1]` would often show a
  // "no target" branch instead of an actual top performer.
  const lastRanked = [...ranked].reverse().findIndex((r) => r.ratio !== null);
  const bestIndex = lastRanked === -1 ? -1 : ranked.length - 1 - lastRanked;
  const tail = !expanded && ranked.length > COLLAPSED_HEAD && bestIndex >= COLLAPSED_HEAD ? [{ row: ranked[bestIndex], rank: bestIndex + 1 }] : [];

  return (
    <div className="flex h-full flex-col rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          Branch Performance (MTD){metrics.length === 1 ? ` — ${metrics[0].label}` : ""}
        </h2>
        <div className="flex items-center gap-2">
          {metrics.length > 1 ? (
            <select
              value={metric}
              onChange={(e) => {
                setMetric(e.target.value);
                setExpanded(false);
              }}
              className="h-7 rounded border border-border-strong px-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {metrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          ) : null}
          {ranked.length > COLLAPSED_HEAD + 1 ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="text-[11px] font-medium text-bad hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {expanded ? "Show less" : "View all"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {head.map((r, i) => (
          <BarRow
            key={`${r.branch}-head-${i}`}
            rank={i + 1}
            r={r}
            max={max}
            metricLabel={config.label}
            isOpen={openBreakdowns.has(r.branch)}
            onToggle={() => toggleBreakdown(r.branch)}
          />
        ))}
        {showEllipsis ? <div className="pl-6 text-[11px] text-fg-faint">···</div> : null}
        {tail.map(({ row, rank }) => (
          <BarRow
            key={`${row.branch}-tail`}
            rank={rank}
            r={row}
            max={max}
            metricLabel={config.label}
            isOpen={openBreakdowns.has(row.branch)}
            onToggle={() => toggleBreakdown(row.branch)}
          />
        ))}
      </div>
    </div>
  );
}
