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
  | "tglossPerGusCar"
  | "tkmBpu"
  | "tkmOfftake"
  | "tkmPartsRetail"
  | "tkmPmOc"
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
};

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
  gusParts: { label: "GUS Parts · MTD", kind: "currency", additive: true, gusOnly: true, get: (d) => d.gusParts, drivers: ["gusRo", "gusPartsPerCar"] },
  gusLabour: { label: "GUS Labour · MTD", kind: "currency", additive: true, gusOnly: true, get: (d) => d.gusLabour, drivers: ["gusRo", "gusLabourPerCar"] },
  bpuParts: { label: "BPU Parts · MTD", kind: "currency", additive: true, get: (d) => d.bpuParts, drivers: ["bpuRo", "bpuPerCar"] },
  bpuLabour: { label: "BPU Labour · MTD", kind: "currency", additive: true, get: (d) => d.bpuLabour, drivers: ["bpuRo", "bpuPerCar"] },
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
  gusPartsPerCar: { label: "GUS Parts / car", kind: "currency", gusOnly: true, get: (d) => d.gusPartsPerCar, drivers: ["gusParts", "gusRo"] },
  gusLabourPerCar: { label: "GUS Labour / car", kind: "currency", gusOnly: true, get: (d) => d.gusLabourPerCar, drivers: ["gusLabour", "gusRo"] },
  bpuPerCar: { label: "BPU / car", kind: "currency", get: (d) => d.bpuPerCar, drivers: ["bpuParts", "bpuLabour", "bpuRo"] },
  tglossPerGusCar: { label: "TGLOSS / GUS car", kind: "currency", gusOnly: true, get: (d) => d.tglossPerGusCar, drivers: ["tglossMtd", "gusRo"] },
  tkmBpu: { label: "BPU · % of target", kind: "percent", get: (d) => d.tkm.bpu, drivers: ["bpuRo", "bpuPerCar"] },
  tkmOfftake: { label: "Offtake · % of target", kind: "percent", get: (d) => d.tkm.offtake },
  tkmPartsRetail: { label: "Parts Retail · % of target", kind: "percent", get: (d) => d.tkm.partsRetail },
  tkmPmOc: { label: "PM+OC · % of target", kind: "percent", get: (d) => d.tkm.pmOc, drivers: ["gusRo"] },
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
