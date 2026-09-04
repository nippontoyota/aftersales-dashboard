import type { BranchReport } from "@/lib/report";
import { formatCompact, formatPercent } from "@/lib/format";
import { ProgressCell } from "@/components/progress-bar";
import { DayMonthPair, SectionTable, dayLabel } from "./section-table";

/** CPU/BPU/Offtake/Parts Retail/PM+OC moved to their own "TKM Targets" page
 * (2026-08-31, at the user's request — see tkm-targets/page.tsx and
 * tkm-report-table.tsx) — the "Targets & Achievement" section here now
 * covers only VAS, which stays on the main dashboard. */
export function ReportTable({ branches, daysSincePrevious }: { branches: BranchReport[]; daysSincePrevious: number | null }) {
  const asOf = dayLabel(daysSincePrevious);

  return (
    <div className="space-y-4">
      <SectionTable
        title="Value-Added Services — Volume"
        subtitle={`MTD · ${asOf}`}
        branches={branches}
        columns={[
          { label: "Wheel Balancing", render: (r) => <DayMonthPair day={r.wheelBalancingForTheDay} month={r.wheelBalancingMtd} /> },
          { label: "Wheel Alignment", render: (r) => <DayMonthPair day={r.wheelAlignmentForTheDay} month={r.wheelAlignmentMtd} /> },
          { label: "Brake Skimming", render: (r) => <DayMonthPair day={r.brakeSkimmingForTheDay} month={r.brakeSkimmingMtd} /> },
          { label: "Engine Flush", render: (r) => <DayMonthPair day={r.engineFlushForTheDay} month={r.engineFlushMtd} /> },
          { label: "Evaporator Cleaning", render: (r) => <DayMonthPair day={r.evaporatorCleaningForTheDay} month={r.evaporatorCleaningMtd} /> },
          { label: "Injector Cleaner Diesel/Petrol", render: (r) => <DayMonthPair day={r.injectorCleanerForTheDay} month={r.injectorCleanerMtd} /> },
          { label: "Synthetic Oil (Ltrs)", render: (r) => <DayMonthPair day={r.syntheticOilForTheDay} month={r.syntheticOilMtd} /> },
          { label: "Brake Cleaning Spray", render: (r) => <DayMonthPair day={r.brakeCleaningSprayForTheDay} month={r.brakeCleaningSprayMtd} /> },
          { label: "DIY Count", render: (r) => <DayMonthPair day={r.diyCountForTheDay} month={r.diyCountMtd} /> },
          { label: "DIY Revenue (Rs)", render: (r) => <DayMonthPair day={r.diyRevenueForTheDay} month={r.diyRevenueMtd} format={formatCompact} /> },
        ]}
      />

      <SectionTable
        title="Value-Added Services — Targets"
        subtitle={`today's figure below the bar · ${asOf}`}
        branches={branches}
        columns={[
          {
            label: "Tire (MTD)",
            render: (r) => <ProgressCell actual={r.tireSalesForTheMonth} target={r.tireTarget} caption={`today ${formatCompact(r.tireSales)}`} formatValue={formatCompact} />,
          },
          {
            label: "Battery (MTD)",
            render: (r) => <ProgressCell actual={r.batterySalesForTheMonth} target={r.batteryTarget} caption={`today ${formatCompact(r.batterySales)}`} formatValue={formatCompact} />,
          },
          {
            label: "T-Gloss Penetration",
            render: (r) => (
              <ProgressCell actual={r.penetrationTGlossService} target={r.targetTGlossService} formatValue={formatPercent} />
            ),
          },
          {
            label: "T-Gloss SPO",
            render: (r) => <ProgressCell actual={r.tGlossSpo} target={1} formatValue={formatPercent} />,
          },
        ]}
      />

      <SectionTable
        title="Targets & Achievement"
        subtitle={`today's figure below the bar · ${asOf}`}
        branches={branches}
        columns={[
          {
            label: "VAS Bill",
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
            label: "VAS Gentani",
            render: (r) => <div className="w-20 whitespace-nowrap text-sm font-semibold tabular-nums text-fg">{formatCompact(r.vasGentani)}</div>,
          },
        ]}
      />
    </div>
  );
}
