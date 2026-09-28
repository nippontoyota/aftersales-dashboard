import { computeKpiSummary } from "@/lib/aggregate";
import { formatCompact, formatPercent } from "@/lib/format";
import { regionForBranch, REGIONS, type RegionName } from "@/lib/regions";
import { isBodyPaintOnly, type BranchReport } from "@/lib/report";
import { SectionTable, type SectionColumn } from "../dashboard/section-table";
import { VpBranchLabel, VpMetricButton } from "./vp-compare";
import { slabBandClassName } from "./vp-branch-slab-table";
import { PENETRATION_TARGET, type MetricKey } from "./vp-metrics";

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

function sumOf(rows: BranchReport[], pick: (b: BranchReport) => number | null): number | null {
  let total = 0;
  let found = false;
  for (const r of rows) {
    const v = pick(r);
    if (v === null) continue;
    total += v;
    found = true;
  }
  return found ? total : null;
}

function tone(ratio: number | null): string {
  return slabBandClassName(ratio);
}

/** `ratio` drives the tint; `valueOverride` is the figure the popup opens with when that differs (penetration, tinted by its attainment of the 20% target). */
function Badge({ ratio, label, metric, row, valueOverride }: { ratio: number | null; label: string; metric: MetricKey; row: BranchReport; valueOverride?: number }) {
  const className = `flex h-6 w-full items-center justify-center rounded text-[11px] font-semibold tabular-nums ${tone(ratio)}`;
  if (ratio === null) return <div className={className}>—</div>;
  const target = row.branch === GROUP_LABEL ? { scope: { label: "Group", region: null } } : { branch: row.branch };
  return (
    <VpMetricButton className={className} target={{ metric, value: valueOverride ?? ratio, ...target }}>
      {label}
    </VpMetricButton>
  );
}

/** Engine Flush / Injector Cleaner — count ÷ PM Actual, graded against the 20% penetration target. */
function PenetrationCell({ row, count, metric }: { row: BranchReport; count: number | null; metric: MetricKey }) {
  const pm = row.pmOcAchievementForTheMonth;
  if (row.branch !== GROUP_LABEL && isBodyPaintOnly(row.branch)) return <div className="w-24 text-right text-sm text-fg-faint">—</div>;
  if (count === null || pm === null || pm <= 0) return <div className="w-24 text-right text-sm text-fg-faint">—</div>;
  const pen = count / pm;
  return (
    <div className="flex w-24 flex-col items-end gap-1">
      <div className="whitespace-nowrap text-[10px] tabular-nums text-fg-faint">{formatCompact(count)} · target {formatPercent(PENETRATION_TARGET)}</div>
      <Badge ratio={pen / PENETRATION_TARGET} label={formatPercent(pen)} metric={metric} row={row} valueOverride={pen} />
    </div>
  );
}

/** Tyre / Battery — achieved ÷ BA Tool target as the badge, penetration against PM Actual beside it. */
function TargetPenetrationCell({ row, actual, target, metric }: { row: BranchReport; actual: number | null; target: number | null; metric: MetricKey }) {
  const pm = row.pmOcAchievementForTheMonth;
  const pen = actual !== null && pm !== null && pm > 0 ? actual / pm : null;
  const ratio = actual !== null && target !== null && target > 0 ? actual / target : null;
  if (ratio === null && pen === null) return <div className="w-24 text-right text-sm text-fg-faint">—</div>;
  return (
    <div className="flex w-24 flex-col items-end gap-1">
      <div className="whitespace-nowrap text-[10px] tabular-nums text-fg-faint">
        {actual === null ? "—" : formatCompact(actual)} / {target === null || target <= 0 ? "—" : formatCompact(target)}
      </div>
      <Badge ratio={ratio} label={ratio === null ? "—" : formatPercent(ratio)} metric={metric} row={row} />
      <div className="whitespace-nowrap text-[10px] tabular-nums text-fg-faint">{pen === null ? "—" : `${formatPercent(pen)} of PM`}</div>
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
    engineFlushMtd: sumOf(rows, (b) => (isBodyPaintOnly(b.branch) ? null : b.engineFlushMtd)),
    injectorCleanerMtd: sumOf(rows, (b) => (isBodyPaintOnly(b.branch) ? null : b.injectorCleanerMtd)),
    tireSalesForTheMonth: sumOf(rows, (b) => b.tireSalesForTheMonth),
    tireTarget: sumOf(rows, (b) => b.tireTarget),
    batterySalesForTheMonth: sumOf(rows, (b) => b.batterySalesForTheMonth),
    batteryTarget: sumOf(rows, (b) => b.batteryTarget),
  };

  const columns: SectionColumn[] = [
    ...SPECS.map((spec) => ({ label: spec.label, render: (row: BranchReport) => <TkmCell spec={spec} row={row} /> })),
    { label: "Engine Flush", render: (row) => <PenetrationCell row={row} count={row.engineFlushMtd} metric="tkmEngineFlush" /> },
    { label: "Injector Cleaner", render: (row) => <PenetrationCell row={row} count={row.injectorCleanerMtd} metric="tkmInjectorCleaner" /> },
    { label: "Tyre", render: (row) => <TargetPenetrationCell row={row} actual={row.tireSalesForTheMonth} target={row.tireTarget} metric="tkmTyre" /> },
    { label: "Battery", render: (row) => <TargetPenetrationCell row={row} actual={row.batterySalesForTheMonth} target={row.batteryTarget} metric="tkmBattery" /> },
  ];

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
