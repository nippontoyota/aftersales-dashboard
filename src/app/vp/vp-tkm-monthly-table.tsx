import { computeKpiSummary } from "@/lib/aggregate";
import { formatCompact } from "@/lib/format";
import { regionForBranch, REGIONS, type RegionName } from "@/lib/regions";
import type { BranchReport } from "@/lib/report";
import { SectionTable, type SectionColumn } from "../dashboard/section-table";
import { VpBranchLabel, VpMetricButton } from "./vp-compare";
import { slabBandClassName } from "./vp-branch-slab-table";
import type { MetricKey } from "./vp-metrics";

/**
 * The monthly TKM Targets view, folded into the VP's one page (2026-09-28 —
 * the standalone /tkm-targets page has the AppShell sidebar, so the VP is
 * redirected away from it). Per branch: BPU, Offtake, Parts Retail, PM+OC
 * achieved ÷ target for the month, with the same tinted % badge as the slab
 * table, each opening the shared "why" popup. No CO01E folding here — for
 * TKM its own target applies (target-overrides.ts), unlike the slab rule.
 */
const GROUP_LABEL = "All branches";

type MetricSpec = { label: string; metric: MetricKey; actual: keyof BranchReport; target: keyof BranchReport; currency: boolean };

const SPECS: MetricSpec[] = [
  { label: "BPU", metric: "tkmBpu", actual: "bpuAchievementForTheMonth", target: "bpuTarget", currency: false },
  { label: "Offtake (Rs)", metric: "tkmOfftake", actual: "offtakeAchievementForTheMonth", target: "offtakeTarget", currency: true },
  { label: "Parts Retail (Rs)", metric: "tkmPartsRetail", actual: "partsRetailAchievementForTheMonth", target: "partsRetailTarget", currency: true },
  { label: "PM+OC", metric: "tkmPmOc", actual: "pmOcAchievementForTheMonth", target: "pmOcTarget", currency: false },
];

const REGION_ORDER = Object.keys(REGIONS) as RegionName[];

function regionSort(a: BranchReport, b: BranchReport): number {
  const ia = REGION_ORDER.indexOf(regionForBranch(a.branch) as RegionName);
  const ib = REGION_ORDER.indexOf(regionForBranch(b.branch) as RegionName);
  const ra = ia < 0 ? REGION_ORDER.length : ia;
  const rb = ib < 0 ? REGION_ORDER.length : ib;
  return ra !== rb ? ra - rb : a.branch.localeCompare(b.branch);
}

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

function TkmCell({ spec, row }: { spec: MetricSpec; row: BranchReport }) {
  const actual = num(row[spec.actual]);
  const target = num(row[spec.target]);
  if (target === null || target === 0) {
    return <div className="w-20 text-right text-sm text-fg-faint">—</div>;
  }
  const ratio = actual === null ? null : actual / target;
  const badgeClass = `flex h-6 w-full items-center justify-center rounded text-[11px] font-semibold tabular-nums ${slabBandClassName(ratio)}`;
  const label = ratio === null ? "—" : `${(ratio * 100).toFixed(1)}%`;
  const isTotal = row.branch === GROUP_LABEL;
  return (
    <div className="flex w-24 flex-col items-end gap-1">
      <div className="whitespace-nowrap text-[10px] tabular-nums text-fg-faint">
        {actual === null ? "—" : formatCompact(actual)} / {formatCompact(target)}
      </div>
      {ratio === null ? (
        <div className={badgeClass}>{label}</div>
      ) : (
        <VpMetricButton
          className={badgeClass}
          target={{ metric: spec.metric, value: ratio, ...(isTotal ? { scope: { label: "Group", region: null } } : { branch: row.branch }) }}
        >
          {label}
        </VpMetricButton>
      )}
    </div>
  );
}

export function VpTkmMonthlyTable({ branches }: { branches: BranchReport[] }) {
  const kpis = computeKpiSummary(branches);
  const rows = [...branches].sort(regionSort);
  const groupRow: BranchReport = {
    ...rows[0],
    branch: GROUP_LABEL,
    bpuAchievementForTheMonth: kpis.bpuAchievementForTheMonth,
    bpuTarget: kpis.bpuTarget,
    offtakeAchievementForTheMonth: kpis.offtakeAchievementForTheMonth,
    offtakeTarget: kpis.offtakeTarget,
    partsRetailAchievementForTheMonth: kpis.partsRetailAchievementForTheMonth,
    partsRetailTarget: kpis.partsRetailTarget,
    pmOcAchievementForTheMonth: kpis.pmOcAchievementForTheMonth,
    pmOcTarget: kpis.pmOcTarget,
  };

  const columns: SectionColumn[] = SPECS.map((spec) => ({ label: spec.label, render: (row) => <TkmCell spec={spec} row={row} /> }));

  return (
    <SectionTable
      title="TKM Targets — this month"
      subtitle="Achieved / target and % for the month so far, per branch"
      branches={rows.length > 0 ? [groupRow, ...rows] : rows}
      columns={columns}
      scroll={false}
      roomy
      renderBranchCell={(row) => <VpBranchLabel label={row.branch} />}
    />
  );
}
