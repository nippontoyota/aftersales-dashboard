import type { CentralMetricView } from "@/lib/central-metric-targets/view-data";
import { CENTRAL_BRANCH_LABELS } from "@/lib/central-region-data";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import { CollapsibleCard } from "@/components/collapsible-card";
import { MonthlyBreakdownTable } from "./monthly-breakdown-table";

const TONE_BAR = { good: "bg-good-solid", warn: "bg-warn-solid", critical: "bg-bad", neutral: "bg-border-strong" } as const;
const TONE_CHIP = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  critical: "bg-bad-soft text-bad",
  neutral: "bg-surface-2 text-fg-faint",
} as const;
const RANK_TONE = { good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", critical: "bg-bad-soft text-bad" } as const;

function rankTone(rank: number, total: number): "good" | "warn" | "critical" {
  if (total <= 1) return "good";
  const pct = (rank - 1) / (total - 1);
  if (pct <= 1 / 3) return "good";
  if (pct <= 2 / 3) return "warn";
  return "critical";
}

function BranchMetricCard({
  branch,
  isCurrency,
  row,
}: {
  branch: string;
  isCurrency: boolean;
  row: CentralMetricView["rows"][number];
}) {
  const fmt = isCurrency ? formatCompactCurrency : formatNumber;
  const pct = row.target !== null && row.target > 0 && row.achieved !== null ? Math.min(100, (row.achieved / row.target) * 100) : 0;
  const tone = row.paceTone;

  return (
    <div className="min-w-[190px] flex-1 space-y-1.5 rounded-lg border border-border-subtle bg-surface-2/30 p-2.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold text-fg">{CENTRAL_BRANCH_LABELS[branch as keyof typeof CENTRAL_BRANCH_LABELS] ?? branch}</span>
        {row.rank ? (
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${RANK_TONE[rankTone(row.rank.rank, row.rank.total)]}`}>
            #{row.rank.rank} of {row.rank.total}
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline justify-between gap-1 text-[12px]">
        <span className="font-semibold tabular-nums text-fg">{fmt(row.achieved)}</span>
        <span className="tabular-nums text-fg-faint">/ {fmt(row.target)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${TONE_CHIP[tone]}`}>
          {tone === "good" ? "On track" : tone === "warn" ? "Slipping" : tone === "critical" ? "Behind" : "—"}
        </span>
        <span className="text-[10px] tabular-nums text-fg-faint">
          {row.target !== null && row.target > 0 && row.achieved !== null ? formatPercent(row.achieved / row.target) : "—"} MTD
        </span>
      </div>

      <div className="border-t border-dashed border-border pt-1.5 text-[10px] leading-tight text-fg-subtle">
        <div>
          Proj. EOM <span className="font-medium text-fg">{fmt(row.pace.projectedEom)}</span>
          {row.pace.requiredRatePerDay !== null && row.pace.requiredRatePerDay > 0 ? (
            <>
              {" · need "}
              <span className="font-medium text-fg">{fmt(row.pace.requiredRatePerDay)}</span>/day
            </>
          ) : null}
        </div>
      </div>

      <div className="text-[10px] leading-tight text-fg-faint">
        <div>
          YTD <span className="font-medium text-fg-muted">{fmt(row.achievedYtd)}</span> / {fmt(row.annualTarget)} annual
        </div>
        <div>
          Proj. year-end <span className="font-medium text-fg-muted">{fmt(row.annualPace.projectedYearEnd)}</span>
          {row.annualPace.requiredRatePerMonth !== null && row.annualPace.requiredRatePerMonth > 0 ? (
            <>
              {" · need "}
              <span className="font-medium text-fg-muted">{fmt(row.annualPace.requiredRatePerMonth)}</span>/mo
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: CentralMetricView }) {
  return (
    <div className="flex flex-wrap gap-2">
      {metric.rows.map((row) => (
        <BranchMetricCard key={row.branch} branch={row.branch} isCurrency={metric.isCurrency} row={row} />
      ))}
    </div>
  );
}

/**
 * TKM Targets — Central region's own page (2026-09-26, replacing the RM's
 * separate BusinessTracker Excel for these 7 metrics), on its own nav item
 * below My Region — additive, not a replacement for the GS/BP/Ext Sales +
 * slab view there (see central_metric_targets in db/schema.sql for how the
 * two relate). Read-only: editing targets happens on the separate Set
 * Targets page (2026-09-26, moved there at the RM's request so this page
 * stays a clean view, not a form). BPU/Offtake/SPR Internal/PM+OC/Battery/
 * Tyre targets come from BA Tool's own target fields for closed months,
 * hardcoded by the RM (seeded from his 2026 Excel) for months BA Tool
 * hasn't reached yet; SPR External has no BA Tool target field at all and
 * is always hardcoded, though its *achieved* figure is live from the Part
 * Sale Report, same as the rest of the app.
 */
export function TkmTargetsSection({ metrics }: { metrics: CentralMetricView[] }) {
  return (
    <div className="space-y-3">
      {metrics.map((metric) => (
        <CollapsibleCard key={metric.key} title={metric.label} subtitle="Target / Achieved · MTD pace · Year pace · Rank" defaultOpen>
          <div className="p-3">
            <MetricCard metric={metric} />
            <MonthlyBreakdownTable metric={metric} branchLabels={CENTRAL_BRANCH_LABELS} />
          </div>
        </CollapsibleCard>
      ))}
    </div>
  );
}
