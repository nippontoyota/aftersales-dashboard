"use client";

import { useState } from "react";
import Link from "next/link";
import type { CeoRegionRollup } from "@/lib/ceo-data";
import { achievementTone } from "@/lib/aggregate";
import { formatCompact, formatCompactCurrency, formatNumber } from "@/lib/format";

const TONE_TEXT = { good: "text-good", warn: "text-warn", critical: "text-bad", neutral: "text-fg" } as const;
const TONE_BAR = { good: "bg-good-solid", warn: "bg-warn-solid", critical: "bg-bad-solid", neutral: "bg-border-strong" } as const;

const REGION_COLOR: Record<CeoRegionRollup["region"], string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

/**
 * One region's overview card — revenue/profit headline + GS/BP utilization
 * bars (unchanged), plus a click-to-expand detail panel for Revenue/RO,
 * Profit/RO, bay counts and per-bay targets (2026-10-01, at the user's
 * request — this replaced a separate standalone region table so the data
 * lives where regions are already summarized, not a third place on the
 * page). The whole card used to be one big Link; now the expand toggle and
 * the "View branches" link are separate clickable elements (a <button>
 * nested inside an <a> is invalid HTML) — same reasoning as
 * branch-performance-heatmap's nested expand/drilldown buttons.
 */
export function RegionCard({ region, date }: { region: CeoRegionRollup; date: string }) {
  const [open, setOpen] = useState(false);
  const gsTone = achievementTone(region.utilization.gs?.utilizationPct ?? null);
  const bpTone = achievementTone(region.utilization.bp?.utilizationPct ?? null);
  const u = region.unitEconomics;

  return (
    <div className="group rounded-xl border border-border-subtle bg-surface/60 p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-sm transition-all duration-200 hover:border-accent/40 hover:bg-surface hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between focus-visible:outline-none"
      >
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-fg">
          <span className="h-2 w-2 rounded-full shadow-sm" style={{ background: REGION_COLOR[region.region] }} />
          {region.region}
          <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 text-fg-faint transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
            <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="text-[11px] font-medium text-fg-faint">{region.branches.length} branches</span>
      </button>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums tracking-tight text-fg">{formatCompactCurrency(region.hero.totalRevenueStreamMtd)}</span>
        <span className="text-[11px] text-fg-subtle">· {formatCompactCurrency(region.hero.profitMtd)} profit</span>
      </div>
      <div className="mt-4 space-y-2">
        <UtilizationBar label="GS" pct={region.utilization.gs?.utilizationPct ?? null} tone={gsTone} />
        <UtilizationBar label="BP" pct={region.utilization.bp?.utilizationPct ?? null} tone={bpTone} />
      </div>

      {open ? (
        <div className="mt-4 space-y-3 border-t border-border-subtle pt-3">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <Stat label="GS Revenue/RO" value={formatCompactCurrency(u.gsRevenuePerRo)} />
            <Stat label="BP Revenue/RO" value={formatCompactCurrency(u.bpRevenuePerRo)} />
            <Stat label="GS Profit/RO" value={formatCompactCurrency(u.gsProfitPerRo)} />
            <Stat label="BP Profit/RO" value={formatCompactCurrency(u.bpProfitPerRo)} />
          </div>
          <div className="space-y-1 text-[11px] text-fg-subtle">
            <div>
              GS: <span className="font-medium text-fg">{formatCompact(u.gsBays)} bays</span>
              {u.gsTargetPerBayPerDay !== null ? <span> · {formatNumber(u.gsTargetPerBayPerDay)} ROs/bay/day target</span> : null}
            </div>
            <div>
              BP: <span className="font-medium text-fg">{formatCompact(u.bpBays)} bays</span>
              {u.bpTargetPerBayPerDay !== null ? <span> · {formatNumber(u.bpTargetPerBayPerDay)} ROs/bay/day target</span> : null}
            </div>
          </div>
        </div>
      ) : null}

      <Link
        href={`/ceo/branches?date=${date}&region=${region.region}`}
        className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
      >
        View branches →
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-fg-faint">{label}</div>
      <div className="font-medium tabular-nums text-fg">{value}</div>
    </div>
  );
}

function UtilizationBar({ label, pct, tone }: { label: string; pct: number | null; tone: ReturnType<typeof achievementTone> }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-6 shrink-0 font-medium text-fg-subtle">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 shadow-inner">
        <span
          className={`block h-full rounded-full transition-all duration-1000 ease-out ${TONE_BAR[tone]}`}
          style={{ width: `${Math.min(100, Math.round((pct ?? 0) * 100))}%` }}
        />
      </span>
      <span className={`w-9 shrink-0 text-right tabular-nums font-medium ${TONE_TEXT[tone]}`}>
        {pct === null ? "—" : `${Math.round(pct * 100)}%`}
      </span>
    </div>
  );
}
