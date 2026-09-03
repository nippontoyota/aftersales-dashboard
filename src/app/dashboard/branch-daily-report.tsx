import { achievementRatio, achievementTone, type AchievementTone } from "@/lib/aggregate";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import type { BranchReport } from "@/lib/report";
import { DateSelect } from "./date-select";

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

type NumFormatter = (n: number | null) => string;

type MetricRow = {
  kind: "metric";
  label: string;
  today?: number | null;
  mtd?: number | null;
  target?: number | null;
  /** Pre-computed achievement ratio (actual / target). When omitted it's
   * derived from mtd / target. Pass `null` to force a blank % cell. */
  pct?: number | null;
  fmt: NumFormatter;
  strong?: boolean;
};

type GroupRow = { kind: "group"; label: string };

type Row = MetricRow | GroupRow;

const TONE_TEXT: Record<AchievementTone, string> = {
  good: "text-good",
  warn: "text-warn",
  critical: "text-bad",
  neutral: "text-fg-faint",
};

// Order matches the branch's own "Revenue Stream" reference sheet (2026-09-02,
// at the user's request); everything else in the data model is appended under
// "Other KPIs" at the end.
function buildRows(b: BranchReport): Row[] {
  const num = formatNumber;
  const rs = formatCompact;
  const pct = formatPercent;

  return [
    { kind: "group", label: "GUS" },
    { kind: "metric", label: "GUS RO", today: b.gusRoBilledForTheDay, mtd: b.gusRoMtd, fmt: num },
    { kind: "metric", label: "GUS Parts MTD (Rs)", mtd: b.gusPartsMtd, fmt: rs },
    { kind: "metric", label: "GUS Labour MTD (Rs)", mtd: b.gusLabourMtd, fmt: rs },

    { kind: "group", label: "BPU" },
    { kind: "metric", label: "BPU RO", today: b.bpuRoBilledForTheDay, mtd: b.bpuRoMtd, fmt: num },
    { kind: "metric", label: "BPU Parts MTD (Rs)", mtd: b.bpuPartsMtd, fmt: rs },
    { kind: "metric", label: "BPU Labour MTD (Rs)", mtd: b.bpuLabourMtd, fmt: rs },

    { kind: "group", label: "Revenue Stream" },
    { kind: "metric", label: "External Sales MTD (Rs)", mtd: b.externalSalesMtd, fmt: rs },
    { kind: "metric", label: "% on SPR I", mtd: b.externalSalesPctOfSprInternal, pct: null, fmt: pct },

    { kind: "group", label: "VAS Bill" },
    { kind: "metric", label: "VAS Bill", today: b.vasAchievementForTheDay, mtd: b.vasAchievementForTheMonth, target: b.vasBillTarget, pct: b.vasAchievementPercent, fmt: rs },
    { kind: "metric", label: "VAS Gentani (Rs/RO)", mtd: b.vasGentani, fmt: rs },

    { kind: "group", label: "Value-Added Services" },
    { kind: "metric", label: "Wheel Balancing", today: b.wheelBalancingForTheDay, mtd: b.wheelBalancingMtd, fmt: num },
    { kind: "metric", label: "Wheel Alignment", today: b.wheelAlignmentForTheDay, mtd: b.wheelAlignmentMtd, fmt: num },
    { kind: "metric", label: "Brake Skimming", today: b.brakeSkimmingForTheDay, mtd: b.brakeSkimmingMtd, fmt: num },
    { kind: "metric", label: "Evaporator Cleaning", today: b.evaporatorCleaningForTheDay, mtd: b.evaporatorCleaningMtd, fmt: num },
    { kind: "metric", label: "DIY Revenue (Rs)", today: b.diyRevenueForTheDay, mtd: b.diyRevenueMtd, fmt: rs },
    { kind: "metric", label: "Injector Cleaner (Diesel/Petrol)", today: b.injectorCleanerForTheDay, mtd: b.injectorCleanerMtd, fmt: num },
    { kind: "metric", label: "Synthetic Oil (Ltrs)", today: b.syntheticOilForTheDay, mtd: b.syntheticOilMtd, fmt: num },
    { kind: "metric", label: "Brake Cleaning Spray", today: b.brakeCleaningSprayForTheDay, mtd: b.brakeCleaningSprayMtd, fmt: num },

    { kind: "group", label: "Tyre & Battery" },
    { kind: "metric", label: "Tyre", today: b.tireSales, mtd: b.tireSalesForTheMonth, target: b.tireTarget, fmt: num },
    { kind: "metric", label: "Battery", today: b.batterySales, mtd: b.batterySalesForTheMonth, target: b.batteryTarget, fmt: num },

    { kind: "group", label: "Scrap & Used Oil" },
    { kind: "metric", label: "Scrap Revenue (without tax)", today: b.scrapRevenueForTheDay, mtd: b.scrapRevenueMtd, fmt: rs },
    { kind: "metric", label: "Used Oil Revenue (without tax)", today: b.usedOilRevenueForTheDay, mtd: b.usedOilRevenueMtd, fmt: rs },
    { kind: "metric", label: "Total MTD (Rs)", mtd: b.totalRevenueStreamMtd, fmt: rs, strong: true },

    { kind: "group", label: "Other KPIs" },
    { kind: "metric", label: "CPU", today: b.cpuForTheDay, mtd: b.cpuAchievementForTheMonth, fmt: num },
    { kind: "metric", label: "BPU (vs target)", today: b.bpuForTheDay, mtd: b.bpuAchievementForTheMonth, target: b.bpuTarget, fmt: num },
    { kind: "metric", label: "Offtake (Rs)", today: b.offtakeForThePreviousDay, mtd: b.offtakeAchievementForTheMonth, target: b.offtakeTarget, fmt: rs },
    { kind: "metric", label: "Parts Retail (Rs)", today: b.partsRetailForTheDay, mtd: b.partsRetailAchievementForTheMonth, target: b.partsRetailTarget, fmt: rs },
    { kind: "metric", label: "PM + OC", today: b.pmOcForTheDay, mtd: b.pmOcAchievementForTheMonth, target: b.pmOcTarget, fmt: num },
    { kind: "metric", label: "T-Gloss Service Penetration", mtd: b.penetrationTGlossService, target: b.targetTGlossService, fmt: pct },
    { kind: "metric", label: "T-Gloss SPO", pct: b.tGlossSpo, fmt: pct },
    { kind: "metric", label: "Engine Flush", today: b.engineFlushForTheDay, mtd: b.engineFlushMtd, fmt: num },
    { kind: "metric", label: "DIY Count", today: b.diyCountForTheDay, mtd: b.diyCountMtd, fmt: num },
  ];
}

function Cell({ value, fmt, className = "" }: { value: number | null | undefined; fmt: NumFormatter; className?: string }) {
  return (
    <td className={`whitespace-nowrap py-1.5 pl-4 text-right tabular-nums ${className}`}>
      {value === undefined || value === null ? <span className="text-fg-faint">—</span> : fmt(value)}
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
  const rows = buildRows(report);
  const todayHeader =
    daysSincePrevious === null ? "Today" : daysSincePrevious === 1 ? "Today" : `Last ${daysSincePrevious} days`;

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
            {rows.map((row, i) => {
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

              const ratio =
                row.pct !== undefined
                  ? row.pct
                  : row.mtd != null && row.target != null
                    ? achievementRatio(row.mtd, row.target)
                    : null;
              const tone = achievementTone(ratio);

              return (
                <tr key={`m-${i}`} className="border-t border-border-subtle">
                  <td className={`whitespace-nowrap py-1.5 pl-4 pr-3 ${row.strong ? "font-semibold text-fg" : "text-fg-muted"}`}>
                    {row.label}
                  </td>
                  <Cell value={row.today} fmt={row.fmt} className="text-fg-subtle" />
                  <Cell value={row.mtd} fmt={row.fmt} className={row.strong ? "font-semibold text-fg" : "text-fg"} />
                  <Cell value={row.target} fmt={row.fmt} className="text-fg-subtle" />
                  <td className={`whitespace-nowrap py-1.5 pl-4 pr-4 text-right font-medium tabular-nums ${ratio == null ? "text-fg-faint" : TONE_TEXT[tone]}`}>
                    {ratio == null ? "—" : formatPercent(ratio)}
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
