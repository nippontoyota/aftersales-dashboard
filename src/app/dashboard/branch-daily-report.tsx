import { achievementTone, type AchievementTone } from "@/lib/aggregate";
import { formatPercent } from "@/lib/format";
import type { BranchReport } from "@/lib/report";
import { DateSelect } from "./date-select";
import { DAILY_REPORT_ROWS, branchCell, type ValueFmt } from "./daily-report-rows";

/**
 * Branch admin's pre-publish view: their own branch's raw numbers as a plain
 * vertical table — no charts. One row per metric, columns Today / MTD /
 * Target / % Achievement, only the % cell colour-coded. Replaces the
 * Executive Overview dashboard for a branch admin whenever the date they're
 * looking at hasn't been published yet (see dashboard/page.tsx). Once HQ
 * publishes, they get the full company-wide dashboard instead.
 *
 * "Today" is the movement since the previous uploaded snapshot — same
 * convention as the rest of the app; after a skipped day it covers the gap.
 * Rows fed by HQ's BA Tool file are simply blank until that file lands.
 */

const TONE_TEXT: Record<AchievementTone, string> = {
  good: "text-good",
  warn: "text-warn",
  critical: "text-bad",
  neutral: "text-fg-faint",
};

function Cell({ value, fmt, className = "" }: { value: number | null; fmt: ValueFmt; className?: string }) {
  return (
    <td className={`whitespace-nowrap py-1.5 pl-4 text-right tabular-nums ${className}`}>
      {value === null ? <span className="text-fg-faint">—</span> : fmt(value)}
    </td>
  );
}

export function BranchDailyReport({
  report,
  branch,
  date,
  dates,
  uploadedAtLabel,
  daysSincePrevious,
}: {
  report: BranchReport;
  branch: string;
  date: string;
  dates: string[];
  uploadedAtLabel: string;
  daysSincePrevious: number | null;
}) {
  const todayHeader = daysSincePrevious === null || daysSincePrevious === 1 ? "Today" : `Last ${daysSincePrevious} days`;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-lg font-semibold text-fg">
          Daily Report — <span className="tabular-nums">{branch}</span>
        </h1>
        <DateSelect dates={dates} selected={date} region="All" />
      </div>
      <p className="mt-1 text-xs text-fg-faint">
        Your branch&apos;s figures for this date, not yet published by HQ. Rows from HQ&apos;s BA Tool file stay blank until it&apos;s
        uploaded. Pick an earlier, published date to see the full company dashboard. Data as of {uploadedAtLabel} IST.
      </p>

      <div className="mt-4 overflow-x-auto rounded-md border border-border bg-surface">
        <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-fg-faint">
              <th className="py-2 pl-4 pr-3 text-left font-medium">Metric</th>
              <th className="py-2 pl-4 text-right font-medium">{todayHeader}</th>
              <th className="py-2 pl-4 text-right font-medium">MTD</th>
              <th className="py-2 pl-4 text-right font-medium">Target</th>
              <th className="py-2 pl-4 pr-4 text-right font-medium">% Achiev.</th>
            </tr>
          </thead>
          <tbody>
            {DAILY_REPORT_ROWS.map((row, i) => {
              if (row.kind === "group") {
                return (
                  <tr key={`g-${i}`}>
                    <td
                      colSpan={5}
                      className="border-t border-border bg-surface-2 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }

              const cell = branchCell(row, report);
              const tone = achievementTone(cell.ratio);

              return (
                <tr key={`m-${i}`} className="border-t border-border-subtle">
                  <td className={`whitespace-nowrap py-1.5 pl-4 pr-3 ${row.strong ? "font-semibold text-fg" : "text-fg-muted"}`}>
                    {row.label}
                  </td>
                  <Cell value={cell.today} fmt={row.fmt} className="text-fg-subtle" />
                  <Cell value={cell.mtd} fmt={row.fmt} className={row.strong ? "font-semibold text-fg" : "text-fg"} />
                  <Cell value={cell.target} fmt={row.fmt} className="text-fg-subtle" />
                  <td
                    className={`whitespace-nowrap py-1.5 pl-4 pr-4 text-right font-medium tabular-nums ${
                      cell.ratio == null ? "text-fg-faint" : TONE_TEXT[tone]
                    }`}
                  >
                    {cell.ratio == null ? "—" : formatPercent(cell.ratio)}
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
