"use client";

import { Fragment, useState } from "react";
import type { CentralMetricView } from "@/lib/central-metric-targets/view-data";
import { formatCompactCurrency, formatNumber } from "@/lib/format";

const SHORT_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(ym: string): string {
  const idx = Number(ym.slice(5, 7)) - 1;
  return SHORT_MONTH[idx] ?? ym;
}

function monthsUnion(rows: CentralMetricView["rows"]): string[] {
  const set = new Set<string>();
  for (const r of rows) for (const m of r.monthly) set.add(m.month);
  return [...set].sort();
}

function pctTone(achieved: number | null, target: number | null): "good" | "warn" | "critical" | "neutral" {
  if (achieved === null || target === null || target <= 0) return "neutral";
  const pct = achieved / target;
  if (pct >= 1) return "good";
  if (pct >= 0.85) return "warn";
  return "critical";
}

const PCT_TONE_CLASS = { good: "text-good", warn: "text-warn", critical: "text-bad", neutral: "text-fg-faint" } as const;

/** "All months at once" breakdown for one metric (2026-09-26, at the RM's
 * request — the cards above only ever show the selected month). Collapsed
 * by default so the page still reads as a summary first. */
export function MonthlyBreakdownTable({ metric, branchLabels }: { metric: CentralMetricView; branchLabels: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const fmt = metric.isCurrency ? formatCompactCurrency : formatNumber;
  const months = monthsUnion(metric.rows);

  if (months.length === 0) return null;

  return (
    <div className="mt-2 border-t border-dashed border-border-subtle pt-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1 text-[10.5px] font-medium text-fg-subtle hover:text-fg"
      >
        <svg className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 5l6 5-6 5" />
        </svg>
        {expanded ? "Hide" : "Show"} monthly breakdown
      </button>

      {expanded ? (
        <div className="mt-2 overflow-x-auto">
          <div className="grid min-w-[560px] grid-cols-[52px_repeat(4,minmax(0,1fr))] items-center gap-x-2 gap-y-1.5">
            <span className="text-[9.5px] font-medium uppercase tracking-wide text-fg-faint">Month</span>
            {metric.rows.map((r) => (
              <span key={r.branch} className="truncate text-[9.5px] font-medium uppercase tracking-wide text-fg-faint" title={r.branch}>
                {branchLabels[r.branch] ?? r.branch}
              </span>
            ))}

            {months.map((month) => (
              <Fragment key={month}>
                <span className="text-[11px] font-medium text-fg-subtle">{monthLabel(month)}</span>
                {metric.rows.map((r) => {
                  const entry = r.monthly.find((m) => m.month === month);
                  const achieved = entry?.achieved ?? null;
                  const target = entry?.target ?? null;
                  const tone = pctTone(achieved, target);
                  const pct = tone !== "neutral" && target ? Math.round((achieved! / target) * 100) : null;
                  return (
                    <div key={r.branch} className="flex items-baseline gap-1 text-[11px] tabular-nums">
                      <span className="font-medium text-fg">{fmt(achieved)}</span>
                      <span className="text-fg-faint">/ {fmt(target)}</span>
                      {pct !== null ? <span className={`font-medium ${PCT_TONE_CLASS[tone]}`}>({pct}%)</span> : null}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
