import type { BranchReport } from "@/lib/report";
import { isBodyPaintOnly } from "@/lib/report";
import { achievementRatio } from "@/lib/aggregate";
import { formatCompact } from "@/lib/format";
import { REGIONS, regionForBranch, type RegionName } from "@/lib/regions";
import { BpuCell } from "./revenue-per-vehicle-row";
import { SectionTable, type SectionColumn } from "./section-table";

/**
 * "How much are we earning per car" — one compact table, one row per
 * branch, replacing the earlier 7-board ranked-list layout (2026-09-21, at
 * the user's request — that layout was too much scrolling, "way too
 * messed up"). Columns, left to right: GUS Parts, GUS Labour, BPU (combined,
 * click to split Parts/Labour), TGloss/GUS, Parts Retail, Offtake — no
 * Total Revenue column (dropped at the user's request). GUS Parts/Labour
 * and TGloss/GUS are banded against fixed per-RO targets; BPU/Parts
 * Retail/Offtake have no fixed target yet, so they're plain figures.
 *
 * Body & Paint-only branches (CO01E/KL01B/TR01B) are shown in their own
 * small table below — their BPU RO counts aren't comparable to a mixed
 * branch's (confirmed 2026-09-11), so they're never mixed into the main
 * rows or its "All branches" total.
 */
function perVehicleCell(revenue: number | null, roCount: number | null) {
  const value = achievementRatio(revenue, roCount);
  return <div className="w-20 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-fg">{formatCompact(value)}</div>;
}

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
  {
    label: "BPU (Rs/Car)",
    render: (r) => (
      <BpuCell
        combined={achievementRatio((r.bpuPartsMtd ?? 0) + (r.bpuLabourMtd ?? 0), r.bpuRoMtd)}
        parts={achievementRatio(r.bpuPartsMtd, r.bpuRoMtd)}
        labour={achievementRatio(r.bpuLabourMtd, r.bpuRoMtd)}
      />
    ),
  },
  // Relabeled from "VAS (Rs/Car)" — the underlying figure is still total
  // TGLOSS revenue ÷ GUS RO (vasAchievementForTheMonth), not spoTGloss.
  { label: "TGLOSS/GUS (Rs/Car)", render: (r) => bandedPerRoCell(r.vasAchievementForTheMonth, r.gusRoMtd, TGLOSS_PER_RO_BANDS) },
  { label: "Parts Retail (Rs/Car)", render: (r) => perVehicleCell(r.partsRetailAchievementForTheMonth, r.gusRoMtd) },
  { label: "Offtake (Rs/Car)", render: (r) => perVehicleCell(r.offtakeAchievementForTheMonth, r.gusRoMtd) },
];

const BP_ONLY_COLUMNS: SectionColumn[] = [
  {
    label: "BPU (Rs/Car)",
    render: (r) => (
      <BpuCell
        combined={achievementRatio((r.bpuPartsMtd ?? 0) + (r.bpuLabourMtd ?? 0), r.bpuRoMtd)}
        parts={achievementRatio(r.bpuPartsMtd, r.bpuRoMtd)}
        labour={achievementRatio(r.bpuLabourMtd, r.bpuRoMtd)}
      />
    ),
  },
];

/** Company-wide row — sum/sum, not an average of each branch's own ratio
 * (same weighted-ratio convention as Service Gentan I, confirmed with the
 * user 2026-09-21 to avoid the averaging bug caught earlier this session).
 * Every field the COLUMNS above actually read must be summed here. */
type SummableKey =
  | "gusPartsMtd"
  | "gusLabourMtd"
  | "gusRoMtd"
  | "bpuPartsMtd"
  | "bpuLabourMtd"
  | "bpuRoMtd"
  | "vasAchievementForTheMonth"
  | "partsRetailAchievementForTheMonth"
  | "offtakeAchievementForTheMonth";

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
    vasAchievementForTheMonth: sumField(branches, "vasAchievementForTheMonth"),
    bpuPartsMtd: sumField(branches, "bpuPartsMtd"),
    bpuLabourMtd: sumField(branches, "bpuLabourMtd"),
    bpuRoMtd: sumField(branches, "bpuRoMtd"),
    partsRetailAchievementForTheMonth: sumField(branches, "partsRetailAchievementForTheMonth"),
    offtakeAchievementForTheMonth: sumField(branches, "offtakeAchievementForTheMonth"),
  };
}

// Central, then South, then North — same order as REGIONS itself. A branch
// with no region sorts after every real region, alphabetical within its own
// group either way.
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
  const generalBranches = branches.filter((b) => !isBodyPaintOnly(b.branch));
  const bpOnlyBranches = branches.filter((b) => isBodyPaintOnly(b.branch));

  const rows = [...generalBranches].sort(regionSort);
  const withTotal = rows.length > 0 ? [buildAllBranchesRow(generalBranches), ...rows] : rows;

  return (
    <div className="space-y-3">
      <SectionTable title="Revenue Per Vehicle — MTD" subtitle="each stream ÷ its own RO count" branches={withTotal} columns={COLUMNS} />
      {bpOnlyBranches.length > 0 ? (
        <SectionTable
          title="Revenue Per Vehicle — MTD (Body & Paint only)"
          subtitle="BPU stream only — ranked separately, not comparable to a mixed branch's"
          branches={[...bpOnlyBranches].sort((a, b) => a.branch.localeCompare(b.branch))}
          columns={BP_ONLY_COLUMNS}
        />
      ) : null}
    </div>
  );
}
