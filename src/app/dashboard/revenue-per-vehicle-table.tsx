import type { BranchReport } from "@/lib/report";
import { achievementRatio } from "@/lib/aggregate";
import { formatCompact } from "@/lib/format";
import { SectionTable, type SectionColumn } from "./section-table";

/**
 * "How much are we earning per car" — every real revenue stream on the
 * dashboard, each divided by the RO count it actually belongs to (2026-08-31,
 * at the user's request): GUS-billed streams against GUS RO MTD, BPU-billed
 * streams against BPU RO MTD (confirmed with the user — "bpus revenue would
 * be against bpus"), everything else that isn't tied to one specific stream
 * (Parts Retail, Offtake, External Sales, VAS) against GUS RO MTD as the
 * best available proxy for "cars serviced," and Total Revenue Stream against
 * GUS + BPU RO combined since that total blends both populations.
 *
 * Pure presentation — every input here is already computed on BranchReport;
 * nothing new is persisted. Reused as-is for both the HQ comparison table
 * (all branches, on /branches) and a branch admin's own single row (on
 * their Dashboard) — same component, just a different `branches` array,
 * same pattern as report-table.tsx / tkm-report-table.tsx.
 */
function perVehicleCell(revenue: number | null, roCount: number | null) {
  const value = achievementRatio(revenue, roCount);
  return <div className="w-20 whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900">{formatCompact(value)}</div>;
}

const COLUMNS: SectionColumn[] = [
  { label: "GUS Parts (Rs/Car)", render: (r) => perVehicleCell(r.gusPartsMtd, r.gusRoMtd) },
  { label: "GUS Labour (Rs/Car)", render: (r) => perVehicleCell(r.gusLabourMtd, r.gusRoMtd) },
  { label: "BPU Parts (Rs/Car)", render: (r) => perVehicleCell(r.bpuPartsMtd, r.bpuRoMtd) },
  { label: "BPU Labour (Rs/Car)", render: (r) => perVehicleCell(r.bpuLabourMtd, r.bpuRoMtd) },
  { label: "Parts Retail (Rs/Car)", render: (r) => perVehicleCell(r.partsRetailAchievementForTheMonth, r.gusRoMtd) },
  { label: "Offtake (Rs/Car)", render: (r) => perVehicleCell(r.offtakeAchievementForTheMonth, r.gusRoMtd) },

  { label: "VAS (Rs/Car)", render: (r) => perVehicleCell(r.vasAchievementForTheMonth, r.gusRoMtd) },
  {
    label: "Total Revenue (Rs/Car)",
    render: (r) => {
      const combinedRo = r.gusRoMtd !== null || r.bpuRoMtd !== null ? (r.gusRoMtd ?? 0) + (r.bpuRoMtd ?? 0) : null;
      return perVehicleCell(r.totalRevenueStreamMtd, combinedRo);
    },
  },
];

export function RevenuePerVehicleTable({ branches }: { branches: BranchReport[] }) {
  const rows = [...branches].sort((a, b) => a.branch.localeCompare(b.branch));
  return <SectionTable title="Revenue Per Vehicle — MTD" subtitle="each stream ÷ its own RO count" branches={rows} columns={COLUMNS} />;
}
