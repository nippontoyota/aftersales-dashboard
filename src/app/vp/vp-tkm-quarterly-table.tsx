import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { TkmMetricRow, TkmScopeQuarter } from "./vp-tkm-quarterly";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07" -> "Jul-26". */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]}-${String(y).slice(2)}`;
}

function quarterLabel(months: string[]): string {
  const q = Math.floor((Number(months[0].split("-")[1]) - 1) / 3) + 1;
  return `Q${q}`;
}

function fmt(value: number | null, isCurrency: boolean): string {
  if (value === null) return "—";
  return isCurrency ? formatCompactCurrency(value) : formatNumber(value);
}

/** Achievement % banded the same soft green/yellow/orange/red tiers as the
 * rest of the VP's page (vp-band-colors.ts) — ≥100/90/75%. */
function achClassName(ratio: number | null): string {
  if (ratio === null) return "text-fg-faint";
  if (ratio >= 1) return "text-emerald-400";
  if (ratio >= 0.9) return "text-yellow-300";
  if (ratio >= 0.75) return "text-orange-400";
  return "text-red-400";
}

function MetricBlock({ metric, quarter }: { metric: TkmMetricRow; quarter: string }) {
  return (
    <>
      <tr className="border-t border-border-subtle bg-surface-2/40">
        <td className="px-3 py-1.5 text-[11px] font-semibold text-fg" colSpan={metric.months.length + 3}>
          {metric.label}
        </td>
      </tr>
      <tr>
        <td className="px-3 py-1.5 text-[11px] text-fg-faint">Target</td>
        {metric.months.map((c) => (
          <td key={c.month} className="px-3 py-1.5 text-right text-[12px] tabular-nums text-fg-muted">
            {fmt(c.target, metric.isCurrency)}
          </td>
        ))}
        <td className="px-3 py-1.5 text-right text-[12px] font-medium tabular-nums text-fg">{fmt(metric.quarterTarget, metric.isCurrency)}</td>
        <td className="px-3 py-1.5" />
      </tr>
      <tr>
        <td className="px-3 py-1.5 text-[11px] text-fg-faint">Achievement</td>
        {metric.months.map((c) => (
          <td key={c.month} className="px-3 py-1.5 text-right text-[12px] tabular-nums text-fg">
            {fmt(c.achieved, metric.isCurrency)}
          </td>
        ))}
        <td className="px-3 py-1.5 text-right text-[12px] font-semibold tabular-nums text-fg">{fmt(metric.quarterAchieved, metric.isCurrency)}</td>
        <td className={`px-3 py-1.5 text-right text-[12px] font-semibold tabular-nums ${achClassName(metric.achievementRatio)}`}>
          {formatPercent(metric.achievementRatio)}
        </td>
      </tr>
      <tr className="border-b border-border-subtle">
        <td className="px-3 py-1 text-[10px] text-fg-faint" colSpan={metric.months.length + 2}>
          {quarter} gap
        </td>
        <td className="px-3 py-1 text-right text-[10.5px] tabular-nums text-fg-faint">
          {metric.gap === null ? "—" : metric.gap < 0 ? `(${fmt(Math.abs(metric.gap), metric.isCurrency)})` : fmt(metric.gap, metric.isCurrency)}
        </td>
      </tr>
    </>
  );
}

function ScopeTable({ scope, months, quarter }: { scope: TkmScopeQuarter; months: string[]; quarter: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface">
      <div className="border-b border-border-subtle bg-surface-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg">{scope.label}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <thead>
            <tr className="border-b border-border-subtle text-[10.5px] uppercase tracking-[0.06em] text-fg-faint">
              <th className="px-3 py-1.5 text-left font-medium"> </th>
              {months.map((m) => (
                <th key={m} className="px-3 py-1.5 text-right font-medium">
                  {monthLabel(m)}
                </th>
              ))}
              <th className="px-3 py-1.5 text-right font-medium">{quarter}</th>
              <th className="px-3 py-1.5 text-right font-medium">Ach %</th>
            </tr>
          </thead>
          <tbody>
            {scope.metrics.map((metric) => (
              <MetricBlock key={metric.key} metric={metric} quarter={quarter} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The VP's Excel-matching quarterly TKM rollup (2026-09-28) — Group +
 * each region, BPU/Offtake/Parts Retail/PM+OC target vs achievement for
 * every month of the current calendar quarter, a quarter total, % achieved,
 * and the gap still open. No internal scroll/collapse of its own (each
 * table is small enough not to need it — see the "suffocating" scrolling
 * pass earlier on this page) — just flows with the rest of the page.
 */
export function VpTkmQuarterlyTable({ scopes, months }: { scopes: TkmScopeQuarter[]; months: string[] }) {
  const quarter = quarterLabel(months);
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {scopes.map((scope) => (
        <ScopeTable key={scope.label} scope={scope} months={months} quarter={quarter} />
      ))}
    </div>
  );
}
