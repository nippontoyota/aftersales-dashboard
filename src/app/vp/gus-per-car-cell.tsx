"use client";

import { useEffect, useState } from "react";
import { formatCompact, formatCompactCurrency } from "@/lib/format";
import type { RankInfo } from "@/lib/gus-per-car-trend";
import { useAllBranches } from "./vp-compare";
import { ItemRow } from "./vp-metric-detail";
import { METRICS, type MetricKey } from "./vp-metrics";

/**
 * The VP's "why is this branch low or high" detail for one GUS Parts/Car,
 * Labour/Car, BPU Parts/Car, BPU Labour/Car or TGLOSS/GUS-Car figure
 * (2026-09-25, at the VP's explicit request; extended to BPU and TGLOSS the
 * same day; BPU split into its own Parts/Labour cells 2026-10-01, replacing
 * the old combined cell's click-to-expand split). Wraps the same coloured
 * badge revenue-per-vehicle-table.tsx already renders — click opens a modal
 * with where the branch ranks, who's #1, who's last, and the company
 * average, plus the branch's add-on services (Engine Flush, Wheel
 * Alignment, etc. — the same block as the metric popups, from the
 * precomputed compare data, so nothing is fetched). For TGLOSS, it shows
 * the gap and required daily run-rate to hit this month's target
 * (lib/pace.ts).
 *
 * This used to also show a day-by-day trend for the month — dropped
 * 2026-09-25 at the VP's request after it turned out to be the actual
 * source of the modal's load delay (6 parallel queries reconstructing the
 * whole month's history just for that chart). The rank/leader/average data
 * below was never the slow part — it's computed server-side with the rest
 * of the page, so this modal still opens instantly.
 */

const METRIC_LABEL = {
  parts: "GUS Parts / Car",
  labour: "GUS Labour / Car",
  bpuParts: "BPU Parts / Car",
  bpuLabour: "BPU Labour / Car",
  tgloss: "TGLOSS / GUS Car",
} as const;
type Metric = keyof typeof METRIC_LABEL;

/** The page-wide metric whose add-on items each per-car popup shows. */
const PER_CAR_METRIC: Record<Metric, MetricKey> = {
  parts: "gusPartsPerCar",
  labour: "gusLabourPerCar",
  bpuParts: "bpuPartsPerCar",
  bpuLabour: "bpuLabourPerCar",
  tgloss: "tglossPerGusCar",
};

function rankTone(rank: number, total: number): "good" | "warn" | "critical" {
  if (total <= 1) return "good";
  const pct = (rank - 1) / (total - 1); // 0 = best, 1 = worst
  if (pct <= 1 / 3) return "good";
  if (pct <= 2 / 3) return "warn";
  return "critical";
}

const TONE_BADGE = { good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", critical: "bg-bad-soft text-bad" } as const;

function DetailModal({
  branch,
  metric,
  value,
  rank,
  tglossPace,
  onClose,
}: {
  branch: string;
  metric: Metric;
  value: number;
  rank: RankInfo | null;
  tglossPace?: { target: number | null; gap: number | null; requiredRatePerDay: number | null };
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const allBranches = useAllBranches();
  const items = METRICS[PER_CAR_METRIC[metric]].items ?? [];
  const tone = rank ? rankTone(rank.rank, rank.total) : null;
  const gapToLeader = rank ? rank.leaderValue - value : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-border-subtle px-5 pb-3 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-faint">{branch}</div>
              <h2 className="mt-0.5 text-lg font-semibold text-fg">{METRIC_LABEL[metric]}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-fg-muted hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label="Close"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-fg">{formatCompactCurrency(value)}</div>
        </div>

        <div className="overflow-auto px-5 pb-5">
        {rank ? (
          <div className="mt-3 flex items-center gap-2">
            <span className={`rounded-md px-2 py-1 text-xs font-semibold ${TONE_BADGE[tone!]}`}>
              #{rank.rank} of {rank.total}
            </span>
            <span className="text-xs text-fg-faint">
              {rank.rank === 1 ? "Leading the group" : `${formatCompactCurrency(gapToLeader)} behind ${rank.leaderBranch}`}
            </span>
          </div>
        ) : null}

        {rank ? (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-border-subtle bg-surface-2/40 p-2.5">
              <div className="text-[9.5px] uppercase tracking-[0.08em] text-fg-faint">#1 · {rank.leaderBranch}</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-good">{formatCompactCurrency(rank.leaderValue)}</div>
            </div>
            <div className="rounded-lg border border-border-subtle bg-surface-2/40 p-2.5">
              <div className="text-[9.5px] uppercase tracking-[0.08em] text-fg-faint">Average</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-fg">{formatCompactCurrency(rank.average)}</div>
            </div>
            <div className="rounded-lg border border-border-subtle bg-surface-2/40 p-2.5">
              <div className="text-[9.5px] uppercase tracking-[0.08em] text-fg-faint">Last · {rank.lastBranch}</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-bad">{formatCompactCurrency(rank.lastValue)}</div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-fg-faint">No other branch has a figure to rank against yet this month.</p>
        )}

        {metric === "tgloss" && tglossPace ? (
          <div className="mt-5">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-faint">Pace to this month&apos;s target</div>
            <div className="mt-2.5 rounded-lg border border-border-subtle bg-surface-2/30 px-3 py-2.5 text-[11px] text-fg-muted">
              {tglossPace.target === null ? (
                <div className="text-fg-faint">No TGLOSS target set for this branch yet.</div>
              ) : tglossPace.gap !== null && tglossPace.gap > 0 ? (
                <div className="space-y-1">
                  <div>
                    Target <span className="font-semibold tabular-nums text-fg">{formatCompactCurrency(tglossPace.target)}</span>
                  </div>
                  <div>
                    Gap <span className="font-semibold tabular-nums text-fg">{formatCompactCurrency(tglossPace.gap)}</span>
                    {tglossPace.requiredRatePerDay !== null ? (
                      <>
                        {" · Required "}
                        <span className="font-semibold tabular-nums text-fg">{formatCompactCurrency(tglossPace.requiredRatePerDay)}/day</span>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="font-medium text-good">Target already met this month.</div>
              )}
            </div>
          </div>
        ) : null}

        {items.length ? (
          <div className="mt-5">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-faint">Add-on services · MTD</div>
            <div className="mt-2.5 space-y-2">
              {items.map((item) => (
                <ItemRow key={item} item={item} branch={branch} scopeBranches={allBranches} all={allBranches} />
              ))}
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}

export function GusPerCarCell({
  branch,
  metric,
  value,
  className,
  rank,
  tglossPace,
}: {
  branch: string;
  metric: Metric;
  value: number;
  className: string;
  rank: RankInfo | null;
  tglossPace?: { target: number | null; gap: number | null; requiredRatePerDay: number | null };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${branch} — ${METRIC_LABEL[metric]}: rank & detail`}
        className={`flex h-8 w-20 items-center justify-center whitespace-nowrap rounded text-sm font-semibold tabular-nums transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
      >
        {formatCompact(value)}
      </button>
      {open ? (
        <DetailModal
          branch={branch}
          metric={metric}
          value={value}
          rank={rank}
          tglossPace={tglossPace}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
