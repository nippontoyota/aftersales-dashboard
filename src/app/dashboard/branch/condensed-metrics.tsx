"use client";

import { useState } from "react";
import { DAILY_REPORT_ROWS, branchCell, type MetricDef } from "../daily-report-rows";
import { achievementTone } from "@/lib/aggregate";
import { formatPercent } from "@/lib/format";
import type { BranchReport } from "@/lib/report";
import { eyebrow } from "@/lib/ui";

/** The rows shown before "Show all metrics" is expanded — the day-to-day
 * essentials, in the reference-sheet order. */
const KEY_LABELS = new Set([
  "Total MTD (Rs)",
  "GUS RO",
  "GUS Parts MTD (Rs)",
  "GUS Labour MTD (Rs)",
  "BPU RO",
  "External Sales MTD (Rs)",
  "VAS Bill",
  "Tyre",
  "Battery",
]);

const TONE_TEXT: Record<string, string> = {
  good: "text-good",
  warn: "text-warn",
  critical: "text-bad",
  neutral: "text-fg-faint",
};

function rankByDisplay(def: MetricDef, branches: BranchReport[], branch: string): { rank: number; of: number } | null {
  const rows = branches
    .map((b) => ({ branch: b.branch, v: branchCell(def, b).display }))
    .filter((r): r is { branch: string; v: number } => typeof r.v === "number")
    .sort((a, b) => b.v - a.v);
  const i = rows.findIndex((r) => r.branch === branch);
  return i === -1 ? null : { rank: i + 1, of: rows.length };
}

export function CondensedMetrics({
  report,
  allBranches,
  todayHeader,
}: {
  report: BranchReport;
  allBranches: BranchReport[];
  todayHeader: string;
}) {
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className={eyebrow}>Metrics</h2>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="rounded-md border border-border-strong px-2 py-1 text-[11px] font-medium text-fg-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {showAll ? "Show key metrics" : "Show all metrics"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-fg-faint [&>th]:border-y [&>th]:border-border [&>th]:bg-surface-2 [&>th]:py-1.5">
              <th className="pl-4 pr-3 text-left font-medium">Metric</th>
              <th className="pl-3 text-right font-medium">{todayHeader}</th>
              <th className="pl-3 text-right font-medium">MTD</th>
              <th className="pl-3 text-right font-medium">Target</th>
              <th className="pl-3 text-right font-medium">% Achiev.</th>
              <th className="pl-3 pr-4 text-right font-medium">Rank</th>
            </tr>
          </thead>
          <tbody>
            {DAILY_REPORT_ROWS.map((row, i) => {
              if (row.kind === "group") {
                if (!showAll) return null;
                return (
                  <tr key={`g-${i}`}>
                    <td colSpan={6} className="border-t border-border-subtle bg-surface-2/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-faint">
                      {row.label}
                    </td>
                  </tr>
                );
              }
              if (!showAll && !KEY_LABELS.has(row.label)) return null;

              const cell = branchCell(row, report);
              const rank = rankByDisplay(row, allBranches, report.branch);
              const tone = achievementTone(cell.ratio);

              return (
                <tr key={row.label} className="border-t border-border-subtle">
                  <td className={`whitespace-nowrap py-1.5 pl-4 pr-3 ${row.strong ? "font-semibold text-fg" : "text-fg-subtle"}`}>{row.label}</td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums text-fg-subtle">
                    {cell.today === null ? <span className="text-fg-faint">—</span> : row.fmt(cell.today)}
                  </td>
                  <td className={`whitespace-nowrap py-1.5 pl-3 text-right tabular-nums ${row.strong ? "font-semibold text-fg" : "text-fg"}`}>
                    {cell.mtd === null ? <span className="text-fg-faint">—</span> : row.fmt(cell.mtd)}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums text-fg-faint">
                    {cell.target === null ? "—" : row.fmt(cell.target)}
                  </td>
                  <td className={`whitespace-nowrap py-1.5 pl-3 text-right tabular-nums font-medium ${TONE_TEXT[tone]}`}>
                    {cell.ratio === null ? "—" : formatPercent(cell.ratio)}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pl-3 pr-4 text-right tabular-nums text-fg-faint">
                    {rank ? (
                      <>
                        {rank.rank}
                        <span className="text-[10px]">/{rank.of}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
