import type { BranchReport } from "@/lib/report";
import { REGIONS, regionForBranch, type RegionName } from "@/lib/regions";
import { SectionTable, type SectionColumn } from "./section-table";

/** scom205 sheet 3 ("Service Parts Sales & Stock") — Stock Month TGP and the
 * Service Rate (S/R) table's Total row's S/R Lines (%), per branch. Both are
 * already ratios in the source file (a stock-turn multiple and a percentage),
 * not additive across branches, so unlike RevenuePerVehicleTable there is no
 * "All branches" summary row here — showing a naive sum/average would misstate
 * both figures. */
function stockMonthCell(value: number | null) {
  return <div className="w-20 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-fg">{value === null ? "—" : value.toFixed(2)}</div>;
}

function srLinesPctCell(value: number | null) {
  return <div className="w-20 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-fg">{value === null ? "—" : `${value.toFixed(2)}%`}</div>;
}

const COLUMNS: SectionColumn[] = [
  { label: "Stock Month (TGP)", render: (r) => stockMonthCell(r.stockMonthTgp) },
  { label: "S/R Lines (%) — Total", render: (r) => srLinesPctCell(r.srLinesTotalPct) },
];

const REGION_ORDER: RegionName[] = Object.keys(REGIONS) as RegionName[];

function regionSort(a: BranchReport, b: BranchReport): number {
  const ra = regionForBranch(a.branch);
  const rb = regionForBranch(b.branch);
  const ia = ra ? REGION_ORDER.indexOf(ra) : REGION_ORDER.length;
  const ib = rb ? REGION_ORDER.indexOf(rb) : REGION_ORDER.length;
  if (ia !== ib) return ia - ib;
  return a.branch.localeCompare(b.branch);
}

export function StockServiceRateTable({ branches }: { branches: BranchReport[] }) {
  const rows = [...branches].sort(regionSort);
  return (
    <SectionTable
      title="Stock Month & Service Rate — from Monthly KPI Report"
      subtitle="Stock Month (TGP) and Total S/R Lines (%), as filed"
      branches={rows}
      columns={COLUMNS}
    />
  );
}
