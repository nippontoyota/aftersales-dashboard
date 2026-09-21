import type { BranchReport } from "@/lib/report";
import { achievementRatio } from "@/lib/aggregate";
import { formatCompact } from "@/lib/format";
import { REGIONS, regionForBranch, type RegionName } from "@/lib/regions";
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
  return <div className="w-20 whitespace-nowrap text-sm font-semibold tabular-nums text-fg">{formatCompact(value)}</div>;
}

/** Per-RO GUS target bands (2026-09-21, at the user's request) — fixed
 * thresholds provided by the user for GUS-only per-RO metrics: GUS Parts,
 * GUS Labour, and TGloss/GUS. Higher is always better. A branch with no GUS
 * RO at all (BPU/Body-&-Paint-only, e.g. CO01E/KL01B/TR01B) has nothing
 * GUS to grade, so it gets a plain "—", never a band. */
type Band = { min: number; className: string };

const BAND_COLORS = {
  green: "bg-emerald-500 text-white",
  yellow: "bg-yellow-400 text-black",
  orange: "bg-orange-500 text-white",
  red: "bg-red-500 text-white",
};

const PARTS_PER_RO_BANDS: Band[] = [
  { min: 7000, className: BAND_COLORS.green },
  { min: 6000, className: BAND_COLORS.yellow },
  { min: 5000, className: BAND_COLORS.orange },
];
const LABOUR_PER_RO_BANDS: Band[] = [
  { min: 4000, className: BAND_COLORS.green },
  { min: 3500, className: BAND_COLORS.yellow },
  { min: 3000, className: BAND_COLORS.orange },
];
const TGLOSS_PER_RO_BANDS: Band[] = [
  { min: 1140, className: BAND_COLORS.green },
  { min: 1000, className: BAND_COLORS.yellow },
  { min: 700, className: BAND_COLORS.orange },
];

function bandedPerRoCell(numerator: number | null, gusRoMtd: number | null, bands: Band[]) {
  // No GUS RO at all — this branch has nothing GUS to grade (BPU/Body-&-Paint-only).
  if (gusRoMtd === null || gusRoMtd === 0) {
    return <div className="w-20 whitespace-nowrap text-center text-sm text-fg-faint">—</div>;
  }
  const value = achievementRatio(numerator, gusRoMtd);
  const className = value === null ? "bg-surface-2 text-fg-faint" : (bands.find((b) => value >= b.min)?.className ?? BAND_COLORS.red);
  return (
    <div className={`flex h-8 w-20 items-center justify-center whitespace-nowrap rounded text-sm font-semibold tabular-nums ${className}`}>
      {formatCompact(value)}
    </div>
  );
}

const COLUMNS: SectionColumn[] = [
  { label: "GUS Parts (Rs/Car)", render: (r) => bandedPerRoCell(r.gusPartsMtd, r.gusRoMtd, PARTS_PER_RO_BANDS) },
  { label: "GUS Labour (Rs/Car)", render: (r) => bandedPerRoCell(r.gusLabourMtd, r.gusRoMtd, LABOUR_PER_RO_BANDS) },
  { label: "BPU Parts (Rs/Car)", render: (r) => perVehicleCell(r.bpuPartsMtd, r.bpuRoMtd) },
  { label: "BPU Labour (Rs/Car)", render: (r) => perVehicleCell(r.bpuLabourMtd, r.bpuRoMtd) },
  { label: "Parts Retail (Rs/Car)", render: (r) => perVehicleCell(r.partsRetailAchievementForTheMonth, r.gusRoMtd) },
  { label: "Offtake (Rs/Car)", render: (r) => perVehicleCell(r.offtakeAchievementForTheMonth, r.gusRoMtd) },

  // Relabeled from "VAS (Rs/Car)" to "TGloss/GUS (Rs/Car)" 2026-09-21, at the
  // user's request — the underlying figure is still total VAS revenue ÷ GUS
  // RO (vasAchievementForTheMonth), not spoTGloss; only the name changed.
  { label: "TGloss/GUS (Rs/Car)", render: (r) => bandedPerRoCell(r.vasAchievementForTheMonth, r.gusRoMtd, TGLOSS_PER_RO_BANDS) },
  {
    label: "Total Revenue (Rs/Car)",
    render: (r) => {
      const combinedRo = r.gusRoMtd !== null || r.bpuRoMtd !== null ? (r.gusRoMtd ?? 0) + (r.bpuRoMtd ?? 0) : null;
      return perVehicleCell(r.totalRevenueStreamMtd, combinedRo);
    },
  },
];

/** Company-wide row — sum/sum, not an average of each branch's own ratio
 * (same weighted-ratio convention as Service Gentan I, confirmed with the
 * user 2026-09-21 to avoid the averaging bug caught earlier this session).
 * Every field the COLUMNS above actually read must be summed here — a field
 * left out would silently fall back to whatever `branches[0]` happens to be,
 * which is wrong, not just incomplete. */
type SummableKey =
  | "gusPartsMtd"
  | "gusLabourMtd"
  | "spoTGloss"
  | "vasAchievementForTheMonth"
  | "gusRoMtd"
  | "bpuPartsMtd"
  | "bpuLabourMtd"
  | "bpuRoMtd"
  | "partsRetailAchievementForTheMonth"
  | "offtakeAchievementForTheMonth"
  | "totalRevenueStreamMtd";

function sumField(branches: BranchReport[], key: SummableKey): number | null {
  let total = 0;
  let found = false;
  for (const b of branches) {
    const v = b[key];
    if (typeof v === "number") {
      total += v;
      found = true;
    }
  }
  return found ? total : null;
}

function buildAllBranchesRow(branches: BranchReport[]): BranchReport {
  return {
    ...branches[0],
    branch: "All branches",
    gusRoMtd: sumField(branches, "gusRoMtd"),
    gusPartsMtd: sumField(branches, "gusPartsMtd"),
    gusLabourMtd: sumField(branches, "gusLabourMtd"),
    spoTGloss: sumField(branches, "spoTGloss"),
    vasAchievementForTheMonth: sumField(branches, "vasAchievementForTheMonth"),
    bpuPartsMtd: sumField(branches, "bpuPartsMtd"),
    bpuLabourMtd: sumField(branches, "bpuLabourMtd"),
    bpuRoMtd: sumField(branches, "bpuRoMtd"),
    partsRetailAchievementForTheMonth: sumField(branches, "partsRetailAchievementForTheMonth"),
    offtakeAchievementForTheMonth: sumField(branches, "offtakeAchievementForTheMonth"),
    totalRevenueStreamMtd: sumField(branches, "totalRevenueStreamMtd"),
  };
}

// Central, then South, then North — same order as REGIONS itself
// (2026-09-21, at the user's request, replacing the old alphabetical sort).
// A branch with no region (shouldn't happen with real BA Tool data) sorts
// after every real region, alphabetical within its own group either way.
const REGION_ORDER: RegionName[] = Object.keys(REGIONS) as RegionName[];

function regionSort(a: BranchReport, b: BranchReport): number {
  const ra = regionForBranch(a.branch);
  const rb = regionForBranch(b.branch);
  const ia = ra ? REGION_ORDER.indexOf(ra) : REGION_ORDER.length;
  const ib = rb ? REGION_ORDER.indexOf(rb) : REGION_ORDER.length;
  if (ia !== ib) return ia - ib;
  return a.branch.localeCompare(b.branch);
}

export function RevenuePerVehicleTable({ branches }: { branches: BranchReport[] }) {
  const rows = [...branches].sort(regionSort);
  const withTotal = rows.length > 0 ? [buildAllBranchesRow(branches), ...rows] : rows;
  return <SectionTable title="Revenue Per Vehicle — MTD" subtitle="each stream ÷ its own RO count" branches={withTotal} columns={COLUMNS} />;
}
