import { formatCompact, formatCompactCurrency, formatPercent } from "@/lib/format";
import type { CompareBranchData } from "./vp-compare-data";

export type MetricKind = "currency" | "count" | "percent";

export type MetricKey =
  | "totalRevenue"
  | "gusParts"
  | "gusLabour"
  | "bpuParts"
  | "bpuLabour"
  | "externalSales"
  | "tglossMtd"
  | "tglossPct"
  | "gusRo"
  | "bpuRo"
  | "gusPartsPerCar"
  | "gusLabourPerCar"
  | "bpuPerCar"
  | "bpuPartsPerCar"
  | "bpuLabourPerCar"
  | "tglossPerGusCar"
  | "tkmBpu"
  | "tkmOfftake"
  | "tkmPartsRetail"
  | "tkmPmOc"
  | "tkmEngineFlush"
  | "tkmInjectorCleaner"
  | "tkmTyre"
  | "tkmBattery"
  | "slab1"
  | "slab2"
  | "slab3"
  | "slab4";

export type MetricDef = {
  label: string;
  kind: MetricKind;
  get: (d: CompareBranchData) => number | null;
  /** Body & Paint-only branches have no GUS business, so they never enter this metric's ranking pool. */
  gusOnly?: boolean;
  /** Figures that explain this one — shown in the branch modal as "behind the number". */
  drivers?: MetricKey[];
  /** A total that splits across branches (so each branch's share of a scope's figure makes sense). */
  additive?: boolean;
  /** Add-on services / parts shown under this metric in its popup (count, penetration, rank). */
  items?: ItemKey[];
};

/** Engine Flush / Injector Cleaner penetration target (share of PM Actual), set by the VP 2026-09-28. */
export const PENETRATION_TARGET = 0.2;

export type ItemKey =
  | "wheelAlignmentGs"
  | "wheelBalancingGs"
  | "brakeSkimmingGs"
  | "evaporator"
  | "wheelAlignmentBp"
  | "wheelBalancingBp"
  | "brakeSkimmingBp"
  | "engineFlush"
  | "injectorCleaner"
  | "brakeSpray"
  | "tyre"
  | "battery"
  | "diy";

export type ItemDef = {
  label: string;
  count: (d: CompareBranchData) => number | null;
  /** What penetration is measured against, e.g. PM Actual. */
  denom: (d: CompareBranchData) => number | null;
  denomLabel: string;
  revenue?: (d: CompareBranchData) => number | null;
  /** Body & Paint-only branches have no General Service business, so they drop out of this item's pool. */
  gusOnly?: boolean;
  note?: string;
};

const pmDenom = (d: CompareBranchData) => d.pm;

export const ITEMS: Record<ItemKey, ItemDef> = {
  wheelAlignmentGs: { label: "Wheel Alignment", count: (d) => d.items.wheelAlignmentGs, denom: pmDenom, denomLabel: "PM Actual", gusOnly: true },
  wheelBalancingGs: { label: "Wheel Balancing", count: (d) => d.items.wheelBalancingGs, denom: pmDenom, denomLabel: "PM Actual", gusOnly: true },
  brakeSkimmingGs: { label: "Brake Skimming", count: (d) => d.items.brakeSkimmingGs, denom: pmDenom, denomLabel: "PM Actual", gusOnly: true },
  evaporator: { label: "Evaporator Cleaning", count: (d) => d.items.evaporator, denom: pmDenom, denomLabel: "PM Actual", gusOnly: true, note: "General Service only" },
  wheelAlignmentBp: { label: "Wheel Alignment", count: (d) => d.items.wheelAlignmentBp, denom: pmDenom, denomLabel: "PM Actual" },
  wheelBalancingBp: { label: "Wheel Balancing", count: (d) => d.items.wheelBalancingBp, denom: pmDenom, denomLabel: "PM Actual" },
  brakeSkimmingBp: { label: "Brake Skimming", count: (d) => d.items.brakeSkimmingBp, denom: pmDenom, denomLabel: "PM Actual" },
  engineFlush: { label: "Engine Flush", count: (d) => d.items.engineFlush, denom: pmDenom, denomLabel: "PM Actual", gusOnly: true },
  injectorCleaner: { label: "Injector Cleaner", count: (d) => d.items.injectorCleaner, denom: pmDenom, denomLabel: "PM Actual", gusOnly: true },
  brakeSpray: { label: "Brake Cleaning Spray", count: (d) => d.items.brakeSpray, denom: pmDenom, denomLabel: "PM Actual", gusOnly: true },
  tyre: { label: "Tyre", count: (d) => d.items.tyre, denom: pmDenom, denomLabel: "PM Actual", gusOnly: true, note: "branch-wide (BA Tool)" },
  battery: { label: "Battery", count: (d) => d.items.battery, denom: pmDenom, denomLabel: "PM Actual", gusOnly: true, note: "branch-wide (BA Tool)" },
  diy: { label: "DIY", count: (d) => d.items.diyCount, denom: pmDenom, denomLabel: "PM Actual", revenue: (d) => d.items.diyRevenue, gusOnly: true },
};

const LABOUR_GUS_ITEMS: ItemKey[] = ["wheelAlignmentGs", "wheelBalancingGs", "brakeSkimmingGs", "evaporator"];
const LABOUR_BPU_ITEMS: ItemKey[] = ["wheelAlignmentBp", "wheelBalancingBp", "brakeSkimmingBp"];
const PARTS_GUS_ITEMS: ItemKey[] = ["engineFlush", "injectorCleaner", "brakeSpray", "tyre", "battery", "diy"];

const slab = (n: 1 | 2 | 3 | 4): MetricDef => ({
  label: `Incentive Slab ${n} · % achieved`,
  kind: "percent",
  get: (d) => d.slabs?.[n - 1].ratio ?? null,
  drivers: ["totalRevenue", "gusRo", "bpuRo", "gusPartsPerCar", "gusLabourPerCar"],
});

export const METRICS: Record<MetricKey, MetricDef> = {
  totalRevenue: {
    label: "Total Revenue Stream · MTD",
    kind: "currency",
    additive: true,
    get: (d) => d.totalRevenue,
    drivers: ["gusRo", "bpuRo", "gusPartsPerCar", "gusLabourPerCar", "bpuPerCar", "externalSales"],
  },
  gusParts: { label: "GUS Parts · MTD", kind: "currency", additive: true, gusOnly: true, get: (d) => d.gusParts, drivers: ["gusRo", "gusPartsPerCar"], items: PARTS_GUS_ITEMS },
  gusLabour: { label: "GUS Labour · MTD", kind: "currency", additive: true, gusOnly: true, get: (d) => d.gusLabour, drivers: ["gusRo", "gusLabourPerCar"], items: LABOUR_GUS_ITEMS },
  bpuParts: { label: "BPU Parts · MTD", kind: "currency", additive: true, get: (d) => d.bpuParts, drivers: ["bpuRo", "bpuPerCar"] },
  bpuLabour: { label: "BPU Labour · MTD", kind: "currency", additive: true, get: (d) => d.bpuLabour, drivers: ["bpuRo", "bpuPerCar"], items: LABOUR_BPU_ITEMS },
  externalSales: { label: "External Sales · MTD", kind: "currency", additive: true, get: (d) => d.externalSales },
  tglossMtd: { label: "TGLOSS · MTD", kind: "currency", additive: true, gusOnly: true, get: (d) => d.tglossMtd, drivers: ["gusRo", "tglossPerGusCar", "tglossPct"] },
  tglossPct: {
    label: "TGLOSS Achievement",
    kind: "percent",
    gusOnly: true,
    get: (d) => (d.tglossMtd === null || !d.tglossTarget ? null : d.tglossMtd / d.tglossTarget),
    drivers: ["tglossMtd", "gusRo", "tglossPerGusCar"],
  },
  gusRo: { label: "GUS RO · MTD", kind: "count", additive: true, gusOnly: true, get: (d) => d.gusRo },
  bpuRo: { label: "BPU RO · MTD", kind: "count", additive: true, get: (d) => d.bpuRo },
  gusPartsPerCar: { label: "GUS Parts / car", kind: "currency", gusOnly: true, get: (d) => d.gusPartsPerCar, drivers: ["gusParts", "gusRo"], items: PARTS_GUS_ITEMS },
  gusLabourPerCar: { label: "GUS Labour / car", kind: "currency", gusOnly: true, get: (d) => d.gusLabourPerCar, drivers: ["gusLabour", "gusRo"], items: LABOUR_GUS_ITEMS },
  bpuPerCar: { label: "BPU / car", kind: "currency", get: (d) => d.bpuPerCar, drivers: ["bpuParts", "bpuLabour", "bpuRo"], items: LABOUR_BPU_ITEMS },
  bpuPartsPerCar: { label: "BPU Parts / car", kind: "currency", get: (d) => d.bpuPartsPerCar, drivers: ["bpuParts", "bpuRo"] },
  bpuLabourPerCar: { label: "BPU Labour / car", kind: "currency", get: (d) => d.bpuLabourPerCar, drivers: ["bpuLabour", "bpuRo"], items: LABOUR_BPU_ITEMS },
  tglossPerGusCar: { label: "TGLOSS / GUS car", kind: "currency", gusOnly: true, get: (d) => d.tglossPerGusCar, drivers: ["tglossMtd", "gusRo"] },
  tkmBpu: { label: "BPU · % of target", kind: "percent", get: (d) => d.tkm.bpu, drivers: ["bpuRo", "bpuPerCar"] },
  tkmOfftake: { label: "Offtake · % of target", kind: "percent", get: (d) => d.tkm.offtake },
  tkmPartsRetail: { label: "Parts Retail · % of target", kind: "percent", get: (d) => d.tkm.partsRetail },
  tkmPmOc: { label: "PM+OC · % of target", kind: "percent", get: (d) => d.tkm.pmOc, drivers: ["gusRo"] },
  tkmEngineFlush: { label: "Engine Flush · % of PM", kind: "percent", gusOnly: true, get: (d) => d.tkm.engineFlushPen },
  tkmInjectorCleaner: { label: "Injector Cleaner · % of PM", kind: "percent", gusOnly: true, get: (d) => d.tkm.injectorCleanerPen },
  tkmTyre: { label: "Tyre · % of target", kind: "percent", get: (d) => d.tkm.tyre },
  tkmBattery: { label: "Battery · % of target", kind: "percent", get: (d) => d.tkm.battery },
  slab1: slab(1),
  slab2: slab(2),
  slab3: slab(3),
  slab4: slab(4),
};

export function formatMetric(value: number | null, kind: MetricKind): string {
  if (value === null) return "—";
  if (kind === "currency") return formatCompactCurrency(value);
  if (kind === "percent") return formatPercent(value);
  return formatCompact(value);
}

export type ItemStat = { branch: string; count: number; denom: number; pen: number; revenue: number | null };

/** Every branch with a count and a positive denominator for `item`, by penetration, highest first. */
export function itemPool(all: CompareBranchData[], item: ItemKey): ItemStat[] {
  const def = ITEMS[item];
  const rows: ItemStat[] = [];
  for (const d of all) {
    if (def.gusOnly && d.bodyPaintOnly) continue;
    const count = def.count(d);
    const denom = def.denom(d);
    if (count === null || denom === null || denom <= 0) continue;
    rows.push({ branch: d.branch, count, denom, pen: count / denom, revenue: def.revenue?.(d) ?? null });
  }
  return rows.sort((a, b) => b.pen - a.pen);
}

export type RankedRow = { branch: string; value: number };

/** Every branch that has a real figure for `metric`, highest first. A branch with no figure (or a 0 on a
 * rupee/count metric — no upload, not a real result) is left out rather than ranked last. */
export function rankPool(all: CompareBranchData[], metric: MetricKey): RankedRow[] {
  const def = METRICS[metric];
  const rows: RankedRow[] = [];
  for (const d of all) {
    if (def.gusOnly && d.bodyPaintOnly) continue;
    const value = def.get(d);
    if (value === null) continue;
    if (value === 0 && def.kind !== "percent") continue;
    rows.push({ branch: d.branch, value });
  }
  return rows.sort((a, b) => b.value - a.value);
}
