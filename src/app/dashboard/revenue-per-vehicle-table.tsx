import type { ReactNode } from "react";
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
 * click to split Parts/Labour), TGLOSS/GUS, Parts Retail, Offtake — no
 * Total Revenue column (dropped at the user's request). GUS Parts/Labour
 * and TGLOSS/GUS are banded against fixed per-RO targets; BPU/Parts
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

export type Band = { min: number; className: string };

export const BAND_COLORS = {
  green: "bg-emerald-500 text-white",
  yellow: "bg-yellow-400 text-black",
  orange: "bg-orange-500 text-white",
  red: "bg-red-500 text-white",
};

export const PARTS_PER_RO_BANDS: Band[] = [
  { min: 7000, className: BAND_COLORS.green },
  { min: 6000, className: BAND_COLORS.yellow },
  { min: 5000, className: BAND_COLORS.orange },
];
export const LABOUR_PER_RO_BANDS: Band[] = [
  { min: 4000, className: BAND_COLORS.green },
  { min: 3500, className: BAND_COLORS.yellow },
  { min: 3000, className: BAND_COLORS.orange },
];
export const TGLOSS_PER_RO_BANDS: Band[] = [
  { min: 1140, className: BAND_COLORS.green },
  { min: 1000, className: BAND_COLORS.yellow },
  { min: 700, className: BAND_COLORS.orange },
];

export function bandClassName(value: number | null, bands: Band[]): string {
  return value === null ? "bg-surface-2 text-fg-faint" : (bands.find((b) => value >= b.min)?.className ?? BAND_COLORS.red);
}

function bandedPerRoCell(numerator: number | null, gusRoMtd: number | null, bands: Band[]) {
  if (gusRoMtd === null || gusRoMtd === 0) {
    return <div className="w-20 whitespace-nowrap text-center text-sm text-fg-faint">—</div>;
  }
  const value = achievementRatio(numerator, gusRoMtd);
  return (
    <div className={`flex h-8 w-20 items-center justify-center whitespace-nowrap rounded text-sm font-semibold tabular-nums ${bandClassName(value, bands)}`}>
      {formatCompact(value)}
    </div>
  );
}

/** Lets a caller (the VP's Regions page) swap the plain GUS Parts/Labour/
 * BPU/TGLOSS badges for a clickable cell of its own — e.g. one that opens a
 * rank + detail modal — without this shared table knowing anything about
 * that feature. Falls back to the render this table would've used on its
 * own, so a caller with nothing special to show for a given row (e.g. the
 * "All branches" total, or a branch with no figure yet) can just re-render
 * the same thing. Extended from GUS Parts/Labour only (2026-09-25) to also
 * cover BPU and TGLOSS/GUS the same day, at the VP's request. */
export type GusCellRenderer = (
  row: BranchReport,
  metric: "parts" | "labour" | "bpu" | "tgloss",
  value: number | null,
  plain: () => ReactNode
) => ReactNode;

function gusPartsColumn(renderGusCell?: GusCellRenderer): SectionColumn {
  return {
    label: "GUS Parts (Rs/Car)",
    render: (r) => {
      const plain = () => bandedPerRoCell(r.gusPartsMtd, r.gusRoMtd, PARTS_PER_RO_BANDS);
      if (!renderGusCell) return plain();
      const value = r.gusRoMtd === null || r.gusRoMtd === 0 ? null : achievementRatio(r.gusPartsMtd, r.gusRoMtd);
      return renderGusCell(r, "parts", value, plain);
    },
  };
}

function gusLabourColumn(renderGusCell?: GusCellRenderer): SectionColumn {
  return {
    label: "GUS Labour (Rs/Car)",
    render: (r) => {
      const plain = () => bandedPerRoCell(r.gusLabourMtd, r.gusRoMtd, LABOUR_PER_RO_BANDS);
      if (!renderGusCell) return plain();
      const value = r.gusRoMtd === null || r.gusRoMtd === 0 ? null : achievementRatio(r.gusLabourMtd, r.gusRoMtd);
      return renderGusCell(r, "labour", value, plain);
    },
  };
}

function bpuColumn(renderGusCell?: GusCellRenderer): SectionColumn {
  return {
    label: "BPU (Rs/Car)",
    render: (r) => {
      const plain = () => (
        <BpuCell
          combined={achievementRatio((r.bpuPartsMtd ?? 0) + (r.bpuLabourMtd ?? 0), r.bpuRoMtd)}
          parts={achievementRatio(r.bpuPartsMtd, r.bpuRoMtd)}
          labour={achievementRatio(r.bpuLabourMtd, r.bpuRoMtd)}
        />
      );
      if (!renderGusCell) return plain();
      const hasAny = r.bpuPartsMtd !== null || r.bpuLabourMtd !== null;
      const value = r.bpuRoMtd === null || r.bpuRoMtd === 0 || !hasAny ? null : achievementRatio((r.bpuPartsMtd ?? 0) + (r.bpuLabourMtd ?? 0), r.bpuRoMtd);
      return renderGusCell(r, "bpu", value, plain);
    },
  };
}

function tglossColumn(renderGusCell?: GusCellRenderer): SectionColumn {
  return {
    // Relabeled from "VAS (Rs/Car)" — the underlying figure is still total
    // TGLOSS revenue ÷ GUS RO (vasAchievementForTheMonth), not spoTGloss.
    label: "TGLOSS/GUS (Rs/Car)",
    render: (r) => {
      const plain = () => bandedPerRoCell(r.vasAchievementForTheMonth, r.gusRoMtd, TGLOSS_PER_RO_BANDS);
      if (!renderGusCell) return plain();
      const value = r.gusRoMtd === null || r.gusRoMtd === 0 ? null : achievementRatio(r.vasAchievementForTheMonth, r.gusRoMtd);
      return renderGusCell(r, "tgloss", value, plain);
    },
  };
}

/** First 4 entries are GUS Parts, GUS Labour, BPU, TGLOSS/GUS — what the VP
 * view shows (its own "compact" variant below); Parts Retail and Offtake
 * are HQ-dashboard-only additions the VP doesn't need (confirmed 2026-09-25). */
function buildColumns(renderGusCell?: GusCellRenderer): SectionColumn[] {
  return [
    gusPartsColumn(renderGusCell),
    gusLabourColumn(renderGusCell),
    bpuColumn(renderGusCell),
    tglossColumn(renderGusCell),
    { label: "Parts Retail (Rs/Car)", render: (r) => perVehicleCell(r.partsRetailAchievementForTheMonth, r.gusRoMtd) },
    { label: "Offtake (Rs/Car)", render: (r) => perVehicleCell(r.offtakeAchievementForTheMonth, r.gusRoMtd) },
  ];
}

/** The plain (non-interactive) HQ dashboard columns — kept as a stable
 * export in case anything still imports COLUMNS directly. */
export const COLUMNS: SectionColumn[] = buildColumns();

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

export function RevenuePerVehicleTable({
  branches,
  /** "compact" drops Parts Retail and Offtake — the VP's own view
   * (regions/page.tsx), which only wants GUS Parts, GUS Labour, BPU and
   * TGLOSS/GUS. Defaults to the full 6-column HQ dashboard set. */
  variant = "full",
  defaultOpen,
  /** See GusCellRenderer above — lets the VP's Regions page make the GUS
   * Parts/Labour cells open its own rank + trend detail modal. */
  renderGusCell,
}: {
  branches: BranchReport[];
  variant?: "full" | "compact";
  defaultOpen?: boolean;
  renderGusCell?: GusCellRenderer;
}) {
  const allColumns = buildColumns(renderGusCell);
  const columns = variant === "compact" ? allColumns.slice(0, 4) : allColumns;
  const generalBranches = branches.filter((b) => !isBodyPaintOnly(b.branch));
  const bpOnlyBranches = branches.filter((b) => isBodyPaintOnly(b.branch));

  const rows = [...generalBranches].sort(regionSort);
  const withTotal = rows.length > 0 ? [buildAllBranchesRow(generalBranches), ...rows] : rows;

  return (
    <div className="space-y-3">
      <SectionTable
        title="Revenue Per Vehicle — MTD"
        subtitle="each stream ÷ its own RO count"
        branches={withTotal}
        columns={columns}
        defaultOpen={defaultOpen}
      />
      {bpOnlyBranches.length > 0 ? (
        <SectionTable
          title="Revenue Per Vehicle — MTD (Body & Paint only)"
          subtitle="BPU stream only — ranked separately, not comparable to a mixed branch's"
          branches={[...bpOnlyBranches].sort((a, b) => a.branch.localeCompare(b.branch))}
          columns={BP_ONLY_COLUMNS}
          defaultOpen={defaultOpen}
        />
      ) : null}
    </div>
  );
}
