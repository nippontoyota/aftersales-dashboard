import type { BranchReport } from "@/lib/report";
import { achievementRatio } from "@/lib/aggregate";
import { formatCompact, formatPercent } from "@/lib/format";
import { computePace } from "@/lib/pace";
import { ProgressCell } from "@/components/progress-bar";
import { DayMonthPair, SectionTable, dayLabel } from "./section-table";

/** Tire/Battery sales MTD ÷ PM+OC actual MTD — how much of the branch's PM
 * traffic also bought a tire/battery, not graded against any target (none
 * defined yet), just shown as a plain percentage under the existing
 * progress bar (2026-09-24, at the user's request). */
function penetrationVsPmLine(salesMtd: number | null, pmActualMtd: number | null) {
  return <div className="mt-1 whitespace-nowrap text-[10px] tabular-nums text-fg-faint">PM Pen: {formatPercent(achievementRatio(salesMtd, pmActualMtd))}</div>;
}

/** Engine Flush/Injector Cleaner's target is 20% of PM+OC actual MTD
 * (2026-09-24, at the user's request) — unlike Tire/Battery's ungraded PM
 * Pen line above, this one has an actual target, so it gets the normal
 * ProgressCell current-% badge/bar plus a forecasted-% line (computePace's
 * run-rate-to-month-end projection, same methodology used everywhere else
 * pacing is shown — see lib/pace.ts) underneath instead of a plain ratio. */
const ENGINE_FLUSH_INJECTOR_PM_TARGET_SHARE = 0.2;

function pmTargetShareCell(actualMtd: number | null, pmActualMtd: number | null, date: string) {
  const target = pmActualMtd !== null ? pmActualMtd * ENGINE_FLUSH_INJECTOR_PM_TARGET_SHARE : null;
  const forecastRatio = computePace(date, actualMtd, target).projectedAchievementRatio;
  return (
    <div>
      <ProgressCell actual={actualMtd} target={target} formatValue={formatCompact} />
      <div className="mt-1 whitespace-nowrap text-[10px] tabular-nums text-fg-faint">Forecast: {formatPercent(forecastRatio)}</div>
    </div>
  );
}

/** CPU/BPU/Offtake/Parts Retail/PM+OC moved to their own "TKM Targets" page
 * (2026-08-31, at the user's request — see tkm-targets/page.tsx and
 * tkm-report-table.tsx) — the sections here now cover only VAS/TGLOSS,
 * which stay on the main Reports page. Renamed and re-split 2026-09-24, at
 * the user's request: "Revenue Stream Performance" (ex "Value-Added
 * Services — Targets") keeps only Tire/Battery; TGLOSS Penetration/SPO
 * moved into "TGLOSS Achievement" (ex "Targets & Achievement") alongside
 * the existing TGLOSS/TGLOSS Gentani columns. Engine Flush/Injector
 * Cleaner/Synthetic Oil moved out of Revenue Stream — Volume into Revenue
 * Stream Performance the same day, at the user's request. */
export function ReportTable({
  branches,
  daysSincePrevious,
  date,
}: {
  branches: BranchReport[];
  daysSincePrevious: number | null;
  date: string;
}) {
  const asOf = dayLabel(daysSincePrevious);

  return (
    <div className="space-y-4">
      <SectionTable
        title="Revenue Stream — Volume"
        subtitle={`MTD · ${asOf}`}
        branches={branches}
        columns={[
          { label: "Wheel Balancing", render: (r) => <DayMonthPair day={r.wheelBalancingForTheDay} month={r.wheelBalancingMtd} /> },
          { label: "Wheel Alignment", render: (r) => <DayMonthPair day={r.wheelAlignmentForTheDay} month={r.wheelAlignmentMtd} /> },
          { label: "Brake Skimming", render: (r) => <DayMonthPair day={r.brakeSkimmingForTheDay} month={r.brakeSkimmingMtd} /> },
          { label: "Evaporator Cleaning", render: (r) => <DayMonthPair day={r.evaporatorCleaningForTheDay} month={r.evaporatorCleaningMtd} /> },
          { label: "Brake Cleaning Spray", render: (r) => <DayMonthPair day={r.brakeCleaningSprayForTheDay} month={r.brakeCleaningSprayMtd} /> },
          { label: "DIY Count", render: (r) => <DayMonthPair day={r.diyCountForTheDay} month={r.diyCountMtd} /> },
          { label: "DIY Revenue (Rs)", render: (r) => <DayMonthPair day={r.diyRevenueForTheDay} month={r.diyRevenueMtd} format={formatCompact} /> },
        ]}
      />

      <SectionTable
        title="Revenue Stream Performance"
        subtitle={`today's figure below the bar · ${asOf}`}
        branches={branches}
        columns={[
          {
            label: "Tire (MTD)",
            render: (r) => (
              <div>
                <ProgressCell actual={r.tireSalesForTheMonth} target={r.tireTarget} caption={`today ${formatCompact(r.tireSales)}`} formatValue={formatCompact} />
                {penetrationVsPmLine(r.tireSalesForTheMonth, r.pmOcAchievementForTheMonth)}
              </div>
            ),
          },
          {
            label: "Battery (MTD)",
            render: (r) => (
              <div>
                <ProgressCell actual={r.batterySalesForTheMonth} target={r.batteryTarget} caption={`today ${formatCompact(r.batterySales)}`} formatValue={formatCompact} />
                {penetrationVsPmLine(r.batterySalesForTheMonth, r.pmOcAchievementForTheMonth)}
              </div>
            ),
          },
          {
            label: "Engine Flush",
            render: (r) => pmTargetShareCell(r.engineFlushMtd, r.pmOcAchievementForTheMonth, date),
          },
          {
            label: "Injector Cleaner Diesel/Petrol",
            render: (r) => pmTargetShareCell(r.injectorCleanerMtd, r.pmOcAchievementForTheMonth, date),
          },
          {
            label: "Synthetic Oil (Ltrs)",
            render: (r) => <DayMonthPair day={r.syntheticOilForTheDay} month={r.syntheticOilMtd} />,
          },
        ]}
      />

      <SectionTable
        title="TGLOSS Achievement"
        subtitle={`today's figure below the bar · ${asOf}`}
        branches={branches}
        columns={[
          {
            label: "TGLOSS Penetration",
            render: (r) => (
              <ProgressCell actual={r.penetrationTGlossService} target={r.targetTGlossService} formatValue={formatPercent} />
            ),
          },
          {
            label: "TGLOSS SPO",
            render: (r) => <ProgressCell actual={r.tGlossSpo} target={1} formatValue={formatPercent} />,
          },
          {
            label: "TGLOSS",
            render: (r) => (
              <ProgressCell
                actual={r.vasAchievementForTheMonth}
                target={r.vasBillTarget}
                caption={`today ${formatCompact(r.vasAchievementForTheDay)}`}
                formatValue={formatCompact}
              />
            ),
          },
          {
            label: "TGLOSS Gentani",
            render: (r) => <div className="w-20 whitespace-nowrap text-sm font-semibold tabular-nums text-fg">{formatCompact(r.vasGentani)}</div>,
          },
        ]}
      />
    </div>
  );
}
