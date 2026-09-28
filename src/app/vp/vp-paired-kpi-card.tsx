import type { ComponentProps } from "react";
import { KPI_CARD_ACCENT, TrendChip, type TrendInfo } from "@/components/rich-kpi-card";
import type { Pace } from "@/lib/pace";
import { VpMetricArea } from "./vp-compare";

/**
 * One hero card carrying two related MTD figures — GUS + BPU for the same
 * revenue line (Parts, or Labour) — stacked instead of split across two
 * cards (2026-09-26, at the VP's request: he wants GUS and BPU Parts/Labour
 * paired, not spread across the hero row). Neither figure has a confirmed
 * MTD target (same as the standalone GUS cards this replaces), so each row
 * only ever shows a run rate, never a target bar.
 */
export function VpPairedKpiCard({
  icon,
  color,
  title,
  primaryLabel,
  primaryValue,
  primaryPace,
  primaryTrend,
  secondaryLabel,
  secondaryValue,
  secondaryPace,
  secondaryTrend,
  formatPaceValue,
  primaryTarget,
  secondaryTarget,
}: {
  /** What clicking each half opens (its branch-ranked detail). */
  primaryTarget: ComponentProps<typeof VpMetricArea>["target"];
  secondaryTarget: ComponentProps<typeof VpMetricArea>["target"];
  icon: React.ReactNode;
  color: keyof typeof KPI_CARD_ACCENT;
  /** The card's own heading, e.g. "Parts · MTD". */
  title: string;
  primaryLabel: string;
  primaryValue: string;
  primaryPace: Pace;
  primaryTrend?: TrendInfo | null;
  secondaryLabel: string;
  secondaryValue: string;
  secondaryPace: Pace;
  secondaryTrend?: TrendInfo | null;
  formatPaceValue: (v: number | null) => string;
}) {
  const accent = KPI_CARD_ACCENT[color] ?? KPI_CARD_ACCENT.indigo;

  return (
    <div
      className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface p-3 shadow-card transition-shadow duration-150 hover:shadow-card-hover"
      title={`${primaryLabel}: ${primaryValue} · ${secondaryLabel}: ${secondaryValue}`}
    >
      <span className={`absolute inset-x-0 top-0 h-0.5 ${accent.edge}`} aria-hidden="true" />

      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-medium tracking-[0.01em] text-fg-subtle">{title}</div>
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${accent.chip} [&_svg]:h-3.5 [&_svg]:w-3.5`}>
          {icon}
        </div>
      </div>

      <VpMetricArea className="mt-1.5 rounded hover:bg-surface-2/50" target={primaryTarget}>
        <div className="text-[10px] font-medium text-fg-faint">{primaryLabel}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-lg font-semibold tracking-tight tabular-nums text-fg">{primaryValue}</span>
          {primaryTrend ? <TrendChip trend={primaryTrend} /> : null}
        </div>
        {primaryPace.runRatePerDay !== null ? (
          <div className="mt-0.5 text-[10px] text-fg-faint">
            Run rate <span className="font-medium text-fg-muted">{formatPaceValue(primaryPace.runRatePerDay)}/day</span>
          </div>
        ) : null}
      </VpMetricArea>

      <VpMetricArea className="mt-2 rounded border-t border-border-subtle pt-2 hover:bg-surface-2/50" target={secondaryTarget}>
        <div className="text-[10px] font-medium text-fg-faint">{secondaryLabel}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-base font-semibold tracking-tight tabular-nums text-fg">{secondaryValue}</span>
          {secondaryTrend ? <TrendChip trend={secondaryTrend} /> : null}
        </div>
        {secondaryPace.runRatePerDay !== null ? (
          <div className="mt-0.5 text-[10px] text-fg-faint">
            Run rate <span className="font-medium text-fg-muted">{formatPaceValue(secondaryPace.runRatePerDay)}/day</span>
          </div>
        ) : null}
      </VpMetricArea>
    </div>
  );
}
