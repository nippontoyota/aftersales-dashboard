import { achievementTone, type AchievementTone } from "@/lib/aggregate";
import type { BranchReport } from "@/lib/report";
import type { RegionName } from "@/lib/regions";
import { DateSelect } from "./date-select";
import { DAILY_REPORT_ROWS, branchCell, regionTotalCell, type MetricDef, type ReportCell } from "./daily-report-rows";

// Same categorical hues as the rest of the dashboard — theme tokens so the
// dark palette's lifted variants apply.
const REGION_ACCENT: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

/**
 * Regional manager's pre-publish view: every branch in their region as a
 * column, metrics down the rows, plus a Region total column. Each cell is the
 * MTD figure, tone-coloured where the metric is graded against a target;
 * today's movement / target / % are in the hover tooltip. Ratio-type metrics
 * (%, penetration, per-RO) leave the Region total blank — they don't add up.
 *
 * Replaces the Executive Overview for a regional manager on any date HQ
 * hasn't published yet (see dashboard/page.tsx). After publish they get the
 * full company dashboard, all regions.
 */

const TONE_TEXT: Record<AchievementTone, string> = {
  good: "text-good",
  warn: "text-warn",
  critical: "text-bad",
  neutral: "text-fg",
};

function DataCell({
  def,
  cell,
  label,
  scope,
  strongCol,
}: {
  def: MetricDef;
  cell: ReportCell;
  label: string;
  scope: string;
  strongCol?: boolean;
}) {
  const tone = achievementTone(cell.ratio);
  const parts = [
    `${scope} · ${label}`,
    cell.today != null ? `today ${def.fmt(cell.today)}` : null,
    cell.mtd != null ? `MTD ${def.fmt(cell.mtd)}` : null,
    cell.target != null ? `target ${def.fmt(cell.target)}` : null,
    cell.ratio != null ? `${Math.round(cell.ratio * 100)}%` : null,
  ].filter(Boolean);

  return (
    <td
      title={parts.join(" · ")}
      className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
        strongCol ? "bg-surface-2 font-semibold" : ""
      } ${cell.ratio != null ? TONE_TEXT[tone] : "text-fg"}`}
    >
      {cell.display == null ? <span className="text-fg-faint">—</span> : def.fmt(cell.display)}
    </td>
  );
}

export function RegionDailyReport({
  region,
  branches,
  date,
  dates,
  uploadedAtLabel,
  daysSincePrevious,
}: {
  region: RegionName;
  branches: BranchReport[];
  date: string;
  dates: string[];
  uploadedAtLabel: string;
  daysSincePrevious: number | null;
}) {
  const asOf = daysSincePrevious === null || daysSincePrevious === 1 ? "today" : `last ${daysSincePrevious} days`;
  const branchCodes = branches.map((b) => b.branch);

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">
            Regional Report — <span className="tabular-nums" style={{ color: REGION_ACCENT[region] }}>{region}</span>
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-fg-faint">
            {region} branches for this date, not yet published by HQ. Cells show the month-to-date figure ({asOf}&apos;s
            movement and target in the tooltip); coloured where there&apos;s a target. Rows from HQ&apos;s BA Tool file stay
            blank until it&apos;s uploaded. Pick an earlier, published date to see the full company dashboard. Data as of{" "}
            {uploadedAtLabel} IST.
          </p>
        </div>
        <DateSelect dates={dates} selected={date} region="All" />
      </div>

      <div className="mt-4 max-h-[calc(100dvh-11rem)] overflow-auto rounded-lg border border-border bg-surface shadow-card">
        <table className="border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.07em] text-fg-faint [&>th]:sticky [&>th]:top-0 [&>th]:border-b [&>th]:border-border">
              <th className="sticky left-0 z-30 bg-surface py-2 pl-4 pr-3 text-left font-medium">Metric</th>
              {branchCodes.map((code) => (
                <th key={code} className="z-20 whitespace-nowrap bg-surface px-3 py-2 text-right font-medium">
                  {code}
                </th>
              ))}
              <th className="z-20 whitespace-nowrap bg-surface-2 px-3 py-2 text-right font-semibold text-fg-subtle">Region</th>
            </tr>
          </thead>
          <tbody>
            {DAILY_REPORT_ROWS.map((row, i) => {
              if (row.kind === "group") {
                return (
                  <tr key={`g-${i}`}>
                    <td
                      colSpan={branchCodes.length + 2}
                      className="border-t border-border bg-surface-2 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-fg-subtle"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={`m-${i}`} className="border-t border-border-subtle">
                  <td
                    className={`sticky left-0 z-10 whitespace-nowrap bg-surface py-1.5 pl-4 pr-3 ${
                      row.strong ? "font-semibold text-fg" : "text-fg-muted"
                    }`}
                  >
                    {row.label}
                  </td>
                  {branches.map((b) => (
                    <DataCell key={b.branch} def={row} cell={branchCell(row, b)} label={row.label} scope={b.branch} />
                  ))}
                  <DataCell def={row} cell={regionTotalCell(row, branches)} label={row.label} scope={region} strongCol />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
