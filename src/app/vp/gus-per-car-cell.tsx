"use client";

import { useEffect, useState } from "react";
import { formatCompact, formatCompactCurrency, formatPercent } from "@/lib/format";
import type { GusLabourVasCounts, RankInfo, VasCountDetail } from "@/lib/gus-per-car-trend";

/**
 * The VP's "why is this branch low or high" detail for one GUS Parts/Car,
 * Labour/Car, BPU/Car or TGLOSS/GUS-Car figure (2026-09-25, at the VP's
 * explicit request; extended to BPU and TGLOSS the same day). Wraps the
 * same coloured badge revenue-per-vehicle-table.tsx already renders — click
 * opens a modal with where the branch ranks, who's #1, who's last, and the
 * company average. For Labour only, it also shows the GUS-only Wheel
 * Alignment/Balancing/Brake Skimming penetration against PM Actual (fetched
 * lazily from /api/vp/gus-per-car-trend only for this metric), so a low
 * Labour/Car figure can be checked against real job volume. For BPU, it
 * shows the Parts/Labour split behind the combined figure. For TGLOSS, it
 * shows the gap and required daily run-rate to hit this month's target —
 * both already computed server-side (lib/pace.ts), so neither needs a
 * fetch.
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
  bpu: "BPU / Car",
  tgloss: "TGLOSS / GUS Car",
} as const;
type Metric = keyof typeof METRIC_LABEL;
const VAS_COUNT_LABEL = { wheelAlignment: "Wheel Alignment", wheelBalancing: "Wheel Balancing", brakeSkimming: "Brake Skimming" } as const;

function rankTone(rank: number, total: number): "good" | "warn" | "critical" {
  if (total <= 1) return "good";
  const pct = (rank - 1) / (total - 1); // 0 = best, 1 = worst
  if (pct <= 1 / 3) return "good";
  if (pct <= 2 / 3) return "warn";
  return "critical";
}

const TONE_BADGE = { good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", critical: "bg-bad-soft text-bad" } as const;

function MetricRankRow({ label, detail }: { label: string; detail: VasCountDetail }) {
  const { count, penetrationPct, rank } = detail;
  const tone = rank ? rankTone(rank.rank, rank.total) : null;
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2/30 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-fg">{label}</span>
        <span className="text-right">
          <span className="text-sm font-semibold tabular-nums text-fg">{formatPercent(penetrationPct)}</span>
          <span className="ml-1.5 text-[11px] tabular-nums text-fg-faint">({formatCompact(count)})</span>
        </span>
      </div>
      {rank ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_BADGE[tone!]}`}>
            #{rank.rank} of {rank.total}
          </span>
          <span className="text-[10.5px] text-fg-faint">
            #1 {rank.leaderBranch} {formatPercent(rank.leaderValue)} · avg {formatPercent(rank.average)} · last {rank.lastBranch} {formatPercent(rank.lastValue)}
          </span>
        </div>
      ) : (
        <div className="mt-1.5 text-[10.5px] text-fg-faint">No PM Actual to compare against yet this month.</div>
      )}
    </div>
  );
}

function DetailModal({
  branch,
  metric,
  value,
  rank,
  date,
  bpuSplit,
  tglossPace,
  onClose,
}: {
  branch: string;
  metric: Metric;
  value: number;
  rank: RankInfo | null;
  date: string;
  bpuSplit?: { parts: number | null; labour: number | null };
  tglossPace?: { target: number | null; gap: number | null; requiredRatePerDay: number | null };
  onClose: () => void;
}) {
  const [vasCounts, setVasCounts] = useState<GusLabourVasCounts | null | undefined>(metric === "labour" ? undefined : null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (metric !== "labour") return;
    let cancelled = false;
    fetch(`/api/vp/gus-per-car-trend?branch=${encodeURIComponent(branch)}&date=${date}&metric=${metric}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { vasCounts: GusLabourVasCounts | null }) => {
        if (!cancelled) setVasCounts(data.vasCounts);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [branch, date, metric]);

  const tone = rank ? rankTone(rank.rank, rank.total) : null;
  const gapToLeader = rank ? rank.leaderValue - value : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[90dvh] w-full max-w-md overflow-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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

        <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-fg">{formatCompactCurrency(value)}</div>

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

        {metric === "labour" ? (
          <div className="mt-5">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-faint">Labour job mix · GUS only</div>
            <div className="mt-2.5 space-y-2">
              {loadError ? (
                <div className="rounded-lg border border-dashed border-border-strong p-4 text-center text-xs text-fg-faint">Couldn&apos;t load this — try again.</div>
              ) : vasCounts === undefined ? (
                <div className="flex h-20 items-center justify-center text-xs text-fg-faint">Loading…</div>
              ) : vasCounts === null ? null : (
                <>
                  <MetricRankRow label={VAS_COUNT_LABEL.wheelAlignment} detail={vasCounts.wheelAlignment} />
                  <MetricRankRow label={VAS_COUNT_LABEL.wheelBalancing} detail={vasCounts.wheelBalancing} />
                  <MetricRankRow label={VAS_COUNT_LABEL.brakeSkimming} detail={vasCounts.brakeSkimming} />
                </>
              )}
            </div>
          </div>
        ) : null}

        {metric === "bpu" && bpuSplit ? (
          <div className="mt-5">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-faint">Parts / Labour split</div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border-subtle bg-surface-2/40 p-2.5 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.08em] text-fg-faint">Parts</div>
                <div className="mt-1 text-sm font-semibold tabular-nums text-fg">{formatCompactCurrency(bpuSplit.parts)}</div>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface-2/40 p-2.5 text-center">
                <div className="text-[9.5px] uppercase tracking-[0.08em] text-fg-faint">Labour</div>
                <div className="mt-1 text-sm font-semibold tabular-nums text-fg">{formatCompactCurrency(bpuSplit.labour)}</div>
              </div>
            </div>
          </div>
        ) : null}

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
  date,
  bpuSplit,
  tglossPace,
}: {
  branch: string;
  metric: Metric;
  value: number;
  className: string;
  rank: RankInfo | null;
  date: string;
  bpuSplit?: { parts: number | null; labour: number | null };
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
          date={date}
          bpuSplit={bpuSplit}
          tglossPace={tglossPace}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
