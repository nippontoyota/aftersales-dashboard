import type { ReactNode } from "react";
import type { BranchReport } from "@/lib/report";
import { formatCompact, formatNumber } from "@/lib/format";
import { CollapsibleCard } from "@/components/collapsible-card";

/** Shared by report-table.tsx (Value-Added Services) and
 * tkm-report-table.tsx (TKM Targets, 2026-08-31) — the same per-branch
 * table shell and cell patterns both pages build their SectionTables from. */

export function dayLabel(daysSincePrevious: number | null): string {
  if (daysSincePrevious === null) return "first upload";
  if (daysSincePrevious === 1) return "1 day since previous upload";
  return `${daysSincePrevious} days since previous upload`;
}

/** On a first upload there's no previous snapshot to diff against, so
 * `value` (the "delta") is just the raw total again — showing it as
 * "+48,95,015" right next to an identical "Actual: 48,95,015" reads as a
 * bug, not as "nothing to compare yet." Say that plainly instead. */
export function signedDelta(value: number | null, daysSincePrevious: number | null): string {
  if (daysSincePrevious === null) return "first upload — no prior figure to compare";
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${formatCompact(value)} vs. previous upload`;
}

export type SectionColumn = { label: string; render: (row: BranchReport) => ReactNode };

export function SectionTable({
  title,
  subtitle,
  branches,
  columns,
}: {
  title: string;
  subtitle?: string;
  branches: BranchReport[];
  columns: SectionColumn[];
}) {
  return (
    <CollapsibleCard title={title} subtitle={subtitle}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="sticky left-0 whitespace-nowrap bg-slate-50 px-3 py-2">Branch</th>
              {columns.map((c) => (
                <th key={c.label} className="whitespace-nowrap px-3 py-2">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {branches.map((row) => (
              <tr key={row.branch} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="sticky left-0 whitespace-nowrap bg-white px-3 py-2 font-medium text-slate-900">{row.branch}</td>
                {columns.map((c) => (
                  <td key={c.label} className="px-3 py-2 align-top">
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}

/** A "for the day" / "for the month" number pair, used for value-added-service volume metrics and CPU (no target exists for these, so no status badge). MTD is the one number worth reading at a glance; today's figure is a tooltip, not another line.
 * `daysSincePrevious` only matters for fields where "today" is computed as a delta against the previous upload (CPU) — on a first upload that delta falls back to the raw MTD total, so "Today: X" would just repeat the visible number; say why instead of repeating it. VAS Volume counts aren't deltas at all, so they omit this prop and always show the plain figure. */
export function DayMonthPair({
  day,
  month,
  daysSincePrevious,
  format = formatNumber,
}: {
  day: number | null;
  month: number | null;
  daysSincePrevious?: number | null;
  format?: (value: number | null) => string;
}) {
  const title = daysSincePrevious === null ? "First upload — no prior figure to compare" : `Today: ${format(day)}`;
  return (
    <div className="w-20 whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900" title={title}>
      {format(month)}
    </div>
  );
}
