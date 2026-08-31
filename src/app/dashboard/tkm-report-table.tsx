import type { BranchReport } from "@/lib/report";
import { formatCompact } from "@/lib/format";
import { ProgressCell } from "@/components/progress-bar";
import { DayMonthPair, SectionTable, dayLabel, signedDelta } from "./section-table";

/** CPU/BPU/Offtake/Parts Retail/PM+OC, moved here from report-table.tsx's
 * "Targets & Achievement" section (2026-08-31, at the user's request). */
export function TkmReportTable({ branches, daysSincePrevious }: { branches: BranchReport[]; daysSincePrevious: number | null }) {
  const asOf = dayLabel(daysSincePrevious);

  return (
    <SectionTable
      title="TKM Targets"
      subtitle={`delta below the bar is vs. previous upload · ${asOf}`}
      branches={branches}
      columns={[
        {
          label: "CPU",
          render: (r) => <DayMonthPair day={r.cpuForTheDay} month={r.cpuAchievementForTheMonth} daysSincePrevious={daysSincePrevious} />,
        },
        {
          label: "BPU",
          render: (r) => (
            <ProgressCell actual={r.bpuAchievementForTheMonth} target={r.bpuTarget} caption={signedDelta(r.bpuForTheDay, daysSincePrevious)} formatValue={formatCompact} />
          ),
        },
        {
          label: "Offtake (Rs)",
          render: (r) => (
            <ProgressCell
              actual={r.offtakeAchievementForTheMonth}
              target={r.offtakeTarget}
              caption={signedDelta(r.offtakeForThePreviousDay, daysSincePrevious)}
              formatValue={formatCompact}
            />
          ),
        },
        {
          label: "Parts Retail (Rs)",
          render: (r) => (
            <ProgressCell
              actual={r.partsRetailAchievementForTheMonth}
              target={r.partsRetailTarget}
              caption={signedDelta(r.partsRetailForTheDay, daysSincePrevious)}
              formatValue={formatCompact}
            />
          ),
        },
        {
          label: "PM+OC",
          render: (r) => (
            <ProgressCell actual={r.pmOcAchievementForTheMonth} target={r.pmOcTarget} caption={signedDelta(r.pmOcForTheDay, daysSincePrevious)} formatValue={formatCompact} />
          ),
        },
      ]}
    />
  );
}
