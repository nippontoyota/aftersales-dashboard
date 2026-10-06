import type { ComponentProps } from "react";
import { ExternalSalesIcon } from "@/components/dashboard-icons";
import { KPI_CARD_ACCENT, TrendChip, type TrendInfo } from "@/components/rich-kpi-card";
import { formatCompactCurrency } from "@/lib/format";
import type { Pace } from "@/lib/pace";
import { VpMetricArea } from "./vp-compare";

/**
 * The hero row's "Other Revenue" card — External Sales as the headline
 * figure (clickable, same branch-ranked detail as before) with Scrap and
 * Used Oil as two plain mini-stats underneath, so all three MTD figures
 * that used to only live in the full grid's "Other Revenue" section are
 * visible at a glance (2026-10-01, at the VP's request). Scrap/Used Oil
 * have no per-branch rank pool of their own, so they're plain text, not
 * clickable like External Sales.
 */
export function VpExternalSalesKpiCard({
  target,
  value,
  trend,
  pace,
  scrapValue,
  usedOilValue,
}: {
  target: ComponentProps<typeof VpMetricArea>["target"];
  value: string;
  trend?: TrendInfo | null;
  pace: Pace;
  scrapValue: string;
  usedOilValue: string;
}) {
  const accent = KPI_CARD_ACCENT.teal;

  return (
    <div
      className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface p-3 shadow-card transition-shadow duration-150 hover:shadow-card-hover"
      title={`External Sales: ${value} · Scrap: ${scrapValue} · Used Oil: ${usedOilValue}`}
    >
      <span className={`absolute inset-x-0 top-0 h-0.5 ${accent.edge}`} aria-hidden="true" />

      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-medium tracking-[0.01em] text-fg-subtle">External Sales · MTD</div>
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${accent.chip} [&_svg]:h-3.5 [&_svg]:w-3.5`}>
          <ExternalSalesIcon />
        </div>
      </div>

      <VpMetricArea className="mt-1.5 rounded hover:bg-surface-2/50" target={target}>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-semibold tracking-tight tabular-nums text-fg">{value}</span>
          {trend ? <TrendChip trend={trend} /> : null}
        </div>
        {pace.runRatePerDay !== null ? (
          <div className="mt-0.5 text-[10px] text-fg-faint">
            Run rate <span className="font-medium text-fg-muted">{formatCompactCurrency(pace.runRatePerDay)}/day</span>
          </div>
        ) : null}
      </VpMetricArea>

      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border-subtle pt-2">
        <div>
          <div className="text-[10px] font-medium text-fg-faint">Scrap · MTD</div>
          <div className="mt-0.5 text-sm font-semibold tracking-tight tabular-nums text-fg">{scrapValue}</div>
        </div>
        <div>
          <div className="text-[10px] font-medium text-fg-faint">Used Oil · MTD</div>
          <div className="mt-0.5 text-sm font-semibold tracking-tight tabular-nums text-fg">{usedOilValue}</div>
        </div>
      </div>
    </div>
  );
}
