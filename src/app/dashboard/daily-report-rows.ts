import { achievementRatio } from "@/lib/aggregate";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import type { BranchReport } from "@/lib/report";

/**
 * The single source of truth for the pre-publish raw-report row set — used by
 * both the branch admin's single-branch Daily Report (branch-daily-report.tsx)
 * and the regional manager's wide region table (region-daily-report.tsx), so
 * the two can't drift on which metrics are shown or in what order.
 *
 * Order matches the branch's own "Revenue Stream" reference sheet
 * (2026-09-02); everything else in the data model is appended under
 * "Other KPIs".
 */

export type ValueFmt = (n: number | null) => string;

export type MetricDef = {
  kind: "metric";
  label: string;
  strong?: boolean;
  /** The region-total column sums this across branches when true; ratio-type
   * metrics (%, penetration, per-RO) are `false` and leave the total blank. */
  summable: boolean;
  fmt: ValueFmt;
  today: (b: BranchReport) => number | null;
  mtd: (b: BranchReport) => number | null;
  target: (b: BranchReport) => number | null;
  /** Explicit achievement ratio; when omitted it's derived from mtd/target.
   * `NONE` forces no %/tone (a raw ratio value that isn't target-graded). */
  pct?: (b: BranchReport) => number | null;
};
export type GroupDef = { kind: "group"; label: string };
export type RowDef = MetricDef | GroupDef;

const num = formatNumber;
const rs = formatCompact;
const pctFmt = formatPercent;
const NONE = (): number | null => null;

function m(
  label: string,
  opts: {
    today?: (b: BranchReport) => number | null;
    mtd?: (b: BranchReport) => number | null;
    target?: (b: BranchReport) => number | null;
    pct?: (b: BranchReport) => number | null;
    fmt: ValueFmt;
    summable: boolean;
    strong?: boolean;
  },
): MetricDef {
  return {
    kind: "metric",
    label,
    fmt: opts.fmt,
    summable: opts.summable,
    strong: opts.strong,
    today: opts.today ?? NONE,
    mtd: opts.mtd ?? NONE,
    target: opts.target ?? NONE,
    pct: opts.pct,
  };
}

export const DAILY_REPORT_ROWS: RowDef[] = [
  { kind: "group", label: "GUS" },
  m("GUS RO", { today: (b) => b.gusRoBilledForTheDay, mtd: (b) => b.gusRoMtd, fmt: num, summable: true }),
  m("GUS Parts MTD (Rs)", { mtd: (b) => b.gusPartsMtd, fmt: rs, summable: true }),
  m("GUS Labour MTD (Rs)", { mtd: (b) => b.gusLabourMtd, fmt: rs, summable: true }),

  { kind: "group", label: "BPU" },
  m("BPU RO", { today: (b) => b.bpuRoBilledForTheDay, mtd: (b) => b.bpuRoMtd, fmt: num, summable: true }),
  m("BPU Parts MTD (Rs)", { mtd: (b) => b.bpuPartsMtd, fmt: rs, summable: true }),
  m("BPU Labour MTD (Rs)", { mtd: (b) => b.bpuLabourMtd, fmt: rs, summable: true }),

  { kind: "group", label: "Revenue Stream" },
  m("External Sales MTD (Rs)", { mtd: (b) => b.externalSalesMtd, fmt: rs, summable: true }),
  m("% on SPR I", { mtd: (b) => b.externalSalesPctOfSprInternal, pct: NONE, fmt: pctFmt, summable: false }),

  { kind: "group", label: "VAS Bill" },
  m("VAS Bill", {
    today: (b) => b.vasAchievementForTheDay,
    mtd: (b) => b.vasAchievementForTheMonth,
    target: (b) => b.vasBillTarget,
    pct: (b) => b.vasAchievementPercent,
    fmt: rs,
    summable: true,
  }),
  m("VAS Gentani (Rs/RO)", { mtd: (b) => b.vasGentani, fmt: rs, summable: false }),

  { kind: "group", label: "Value-Added Services" },
  m("Wheel Balancing", { today: (b) => b.wheelBalancingForTheDay, mtd: (b) => b.wheelBalancingMtd, fmt: num, summable: true }),
  m("Wheel Alignment", { today: (b) => b.wheelAlignmentForTheDay, mtd: (b) => b.wheelAlignmentMtd, fmt: num, summable: true }),
  m("Brake Skimming", { today: (b) => b.brakeSkimmingForTheDay, mtd: (b) => b.brakeSkimmingMtd, fmt: num, summable: true }),
  m("Evaporator Cleaning", { today: (b) => b.evaporatorCleaningForTheDay, mtd: (b) => b.evaporatorCleaningMtd, fmt: num, summable: true }),
  m("DIY Revenue (Rs)", { today: (b) => b.diyRevenueForTheDay, mtd: (b) => b.diyRevenueMtd, fmt: rs, summable: true }),
  m("Injector Cleaner (Diesel/Petrol)", { today: (b) => b.injectorCleanerForTheDay, mtd: (b) => b.injectorCleanerMtd, fmt: num, summable: true }),
  m("Synthetic Oil (Ltrs)", { today: (b) => b.syntheticOilForTheDay, mtd: (b) => b.syntheticOilMtd, fmt: num, summable: true }),
  m("Brake Cleaning Spray", { today: (b) => b.brakeCleaningSprayForTheDay, mtd: (b) => b.brakeCleaningSprayMtd, fmt: num, summable: true }),

  { kind: "group", label: "Tyre & Battery" },
  m("Tyre", { today: (b) => b.tireSales, mtd: (b) => b.tireSalesForTheMonth, target: (b) => b.tireTarget, fmt: num, summable: true }),
  m("Battery", { today: (b) => b.batterySales, mtd: (b) => b.batterySalesForTheMonth, target: (b) => b.batteryTarget, fmt: num, summable: true }),

  { kind: "group", label: "Scrap & Used Oil" },
  m("Scrap Revenue (without tax)", { today: (b) => b.scrapRevenueForTheDay, mtd: (b) => b.scrapRevenueMtd, fmt: rs, summable: true }),
  m("Used Oil Revenue (without tax)", { today: (b) => b.usedOilRevenueForTheDay, mtd: (b) => b.usedOilRevenueMtd, fmt: rs, summable: true }),
  m("Total MTD (Rs)", { mtd: (b) => b.totalRevenueStreamMtd, fmt: rs, summable: true, strong: true }),

  { kind: "group", label: "Other KPIs" },
  m("CPU", { today: (b) => b.cpuForTheDay, mtd: (b) => b.cpuAchievementForTheMonth, fmt: num, summable: true }),
  m("BPU (vs target)", { today: (b) => b.bpuForTheDay, mtd: (b) => b.bpuAchievementForTheMonth, target: (b) => b.bpuTarget, fmt: num, summable: true }),
  m("Offtake (Rs)", {
    today: (b) => b.offtakeForThePreviousDay,
    mtd: (b) => b.offtakeAchievementForTheMonth,
    target: (b) => b.offtakeTarget,
    fmt: rs,
    summable: true,
  }),
  m("Parts Retail (Rs)", {
    today: (b) => b.partsRetailForTheDay,
    mtd: (b) => b.partsRetailAchievementForTheMonth,
    target: (b) => b.partsRetailTarget,
    fmt: rs,
    summable: true,
  }),
  m("PM + OC", { today: (b) => b.pmOcForTheDay, mtd: (b) => b.pmOcAchievementForTheMonth, target: (b) => b.pmOcTarget, fmt: num, summable: true }),
  m("T-Gloss Service Penetration", { mtd: (b) => b.penetrationTGlossService, target: (b) => b.targetTGlossService, fmt: pctFmt, summable: false }),
  m("T-Gloss SPO (Rs)", {
    mtd: (b) => b.spoTGloss,
    target: (b) => b.spoTGlossTarget,
    pct: (b) => b.tGlossSpo,
    fmt: rs,
    summable: false,
  }),
  m("Engine Flush", { today: (b) => b.engineFlushForTheDay, mtd: (b) => b.engineFlushMtd, fmt: num, summable: true }),
  m("DIY Count", { today: (b) => b.diyCountForTheDay, mtd: (b) => b.diyCountMtd, fmt: num, summable: true }),
];

export type ReportCell = {
  today: number | null;
  mtd: number | null;
  target: number | null;
  /** Achievement ratio, or null when the metric isn't target-graded. */
  ratio: number | null;
  /** What the compact single-cell views print — mtd when the metric has one,
   * otherwise the achievement ratio. */
  display: number | null;
};

function sumAcross(branches: BranchReport[], get: (b: BranchReport) => number | null): number | null {
  let total = 0;
  let any = false;
  for (const b of branches) {
    const v = get(b);
    if (typeof v === "number") {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}

/** One branch's figures for a metric. */
export function branchCell(def: MetricDef, b: BranchReport): ReportCell {
  const mtd = def.mtd(b);
  const target = def.target(b);
  const ratio = def.pct ? def.pct(b) : mtd != null && target != null ? achievementRatio(mtd, target) : null;
  return { today: def.today(b), mtd, target, ratio, display: mtd ?? ratio };
}

/** The region-total column: real sums for summable metrics, all-null otherwise. */
export function regionTotalCell(def: MetricDef, branches: BranchReport[]): ReportCell {
  if (!def.summable) return { today: null, mtd: null, target: null, ratio: null, display: null };
  const mtd = sumAcross(branches, def.mtd);
  const today = sumAcross(branches, def.today);
  const target = sumAcross(branches, def.target);
  const ratio = mtd != null && target != null ? achievementRatio(mtd, target) : null;
  return { today, mtd, target, ratio, display: mtd };
}
