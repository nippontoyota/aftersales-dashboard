import { CO01B_SLAB_COMBINED_BRANCHES } from "@/lib/body-paint-only";
import { aggregateIncentiveSlabTargets } from "@/lib/incentive-slabs/aggregate";
import type { IncentiveSlabTargets } from "@/lib/incentive-slabs/store";
import { regionForBranch } from "@/lib/regions";
import { isBodyPaintOnly, type BranchReport } from "@/lib/report";

/**
 * Everything the VP's branch-vs-branch compare popup needs, per branch, as
 * plain serialisable numbers (2026-09-28) — built server-side in page.tsx
 * from the already-loaded report and passed to the client-side compare
 * provider, so picking branches to compare never triggers a fetch.
 */
export type SlabCompare = { target: number; ratio: number | null };

/** GS vs Body & Paint Service Info counts, MTD — see lib/vp-service-items.ts. */
export type LabourItemCounts = {
  wheelAlignmentGs: number | null;
  wheelBalancingGs: number | null;
  brakeSkimmingGs: number | null;
  wheelAlignmentBp: number | null;
  wheelBalancingBp: number | null;
  brakeSkimmingBp: number | null;
};

const NO_LABOUR_ITEMS: LabourItemCounts = {
  wheelAlignmentGs: null,
  wheelBalancingGs: null,
  brakeSkimmingGs: null,
  wheelAlignmentBp: null,
  wheelBalancingBp: null,
  brakeSkimmingBp: null,
};

export type CompareBranchData = {
  branch: string;
  region: string | null;
  bodyPaintOnly: boolean;
  totalRevenue: number | null;
  gusParts: number | null;
  gusLabour: number | null;
  gusRo: number | null;
  bpuParts: number | null;
  bpuLabour: number | null;
  bpuRo: number | null;
  externalSales: number | null;
  tglossMtd: number | null;
  tglossTarget: number | null;
  gusPartsPerCar: number | null;
  gusLabourPerCar: number | null;
  bpuPerCar: number | null;
  tglossPerGusCar: number | null;
  /** null when this branch has no slab target of its own (e.g. CO01E, which folds into CO01B). */
  slabs: [SlabCompare, SlabCompare, SlabCompare, SlabCompare] | null;
  /** This month's TKM figures, achieved ÷ target — same fields the main dashboard's TKM Targets page reads. */
  tkm: {
    bpu: number | null;
    offtake: number | null;
    partsRetail: number | null;
    pmOc: number | null;
    /** Item count ÷ PM Actual (penetration). Engine Flush / Injector Cleaner are graded against PENETRATION_TARGET, Tyre / Battery against their own BA Tool target — see tyre / battery below. */
    engineFlushPen: number | null;
    injectorCleanerPen: number | null;
    /** Tyre / Battery achieved ÷ BA Tool target. */
    tyre: number | null;
    battery: number | null;
    tyrePen: number | null;
    batteryPen: number | null;
  };
  /** PM Actual (BA Tool) — the penetration denominator for Labour and TKM add-on items. */
  pm: number | null;
  /** Add-on service / part counts, MTD. */
  items: LabourItemCounts & {
    evaporator: number | null;
    engineFlush: number | null;
    injectorCleaner: number | null;
    brakeSpray: number | null;
    tyre: number | null;
    battery: number | null;
    diyCount: number | null;
    diyRevenue: number | null;
  };
};

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function sumNullable(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

function slabsFor(
  branch: string,
  branches: BranchReport[],
  targets: Record<string, IncentiveSlabTargets>
): CompareBranchData["slabs"] {
  // CO01B's slabs are graded on CO01B + CO01E combined, and CO01E has none of its own — same rule as vp-branch-slab-table.tsx.
  const combined = CO01B_SLAB_COMBINED_BRANCHES.includes(branch);
  if (combined && branch !== "CO01B") return null;
  const t = combined ? aggregateIncentiveSlabTargets(targets, CO01B_SLAB_COMBINED_BRANCHES) : targets[branch];
  if (!t) return null;
  const actual = combined
    ? sumNullable(branches.filter((b) => CO01B_SLAB_COMBINED_BRANCHES.includes(b.branch)).map((b) => b.totalRevenueStreamMtd))
    : (branches.find((b) => b.branch === branch)?.totalRevenueStreamMtd ?? null);
  const s = (target: number): SlabCompare => ({ target, ratio: ratio(actual, target) });
  return [s(t.slab1), s(t.slab2), s(t.slab3), s(t.slab4)];
}

export function buildCompareData(
  branches: BranchReport[],
  incentiveSlabTargets: Record<string, IncentiveSlabTargets>,
  labourItems: Record<string, LabourItemCounts> = {}
): Record<string, CompareBranchData> {
  const out: Record<string, CompareBranchData> = {};
  for (const b of branches) {
    const pm = b.pmOcAchievementForTheMonth;
    out[b.branch] = {
      branch: b.branch,
      region: regionForBranch(b.branch),
      bodyPaintOnly: isBodyPaintOnly(b.branch),
      totalRevenue: b.totalRevenueStreamMtd,
      gusParts: b.gusPartsMtd,
      gusLabour: b.gusLabourMtd,
      gusRo: b.gusRoMtd,
      bpuParts: b.bpuPartsMtd,
      bpuLabour: b.bpuLabourMtd,
      bpuRo: b.bpuRoMtd,
      externalSales: b.externalSalesMtd,
      tglossMtd: b.vasAchievementForTheMonth,
      tglossTarget: b.vasBillTarget,
      gusPartsPerCar: ratio(b.gusPartsMtd, b.gusRoMtd),
      gusLabourPerCar: ratio(b.gusLabourMtd, b.gusRoMtd),
      bpuPerCar:
        b.bpuPartsMtd === null && b.bpuLabourMtd === null ? null : ratio((b.bpuPartsMtd ?? 0) + (b.bpuLabourMtd ?? 0), b.bpuRoMtd),
      tglossPerGusCar: ratio(b.vasAchievementForTheMonth, b.gusRoMtd),
      slabs: slabsFor(b.branch, branches, incentiveSlabTargets),
      tkm: {
        bpu: ratio(b.bpuAchievementForTheMonth, b.bpuTarget),
        offtake: ratio(b.offtakeAchievementForTheMonth, b.offtakeTarget),
        partsRetail: ratio(b.partsRetailAchievementForTheMonth, b.partsRetailTarget),
        pmOc: ratio(b.pmOcAchievementForTheMonth, b.pmOcTarget),
        engineFlushPen: ratio(b.engineFlushMtd, pm),
        injectorCleanerPen: ratio(b.injectorCleanerMtd, pm),
        tyre: ratio(b.tireSalesForTheMonth, b.tireTarget),
        battery: ratio(b.batterySalesForTheMonth, b.batteryTarget),
        tyrePen: ratio(b.tireSalesForTheMonth, pm),
        batteryPen: ratio(b.batterySalesForTheMonth, pm),
      },
      pm,
      items: {
        ...(labourItems[b.branch] ?? NO_LABOUR_ITEMS),
        evaporator: b.evaporatorCleaningMtd,
        engineFlush: b.engineFlushMtd,
        injectorCleaner: b.injectorCleanerMtd,
        brakeSpray: b.brakeCleaningSprayMtd,
        tyre: b.tireSalesForTheMonth,
        battery: b.batterySalesForTheMonth,
        diyCount: b.diyCountMtd,
        diyRevenue: b.diyRevenueMtd,
      },
    };
  }
  return out;
}
