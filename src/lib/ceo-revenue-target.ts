import type { BranchReport } from "./report";

/**
 * Revenue/Profit Target for the CEO view — derived per branch from that
 * branch's own Incentive Slab 3 target, not a company-wide fixed figure.
 * Reverse-engineered from a live HQ reference workbook ("Book1.xlsx", sheet
 * "AfterSale V 1.1") and confirmed with the user 2026-09-22:
 *
 *   - Branch Revenue Target = branch's own Slab 3 target × 30/32. Slab 3 is
 *     set ~7% above the real revenue target company-wide — Group Slab 3
 *     totalled ₹32,00,00,000.02 in the live data on 2026-09-22, and scaling
 *     by 30/32 lands on exactly ₹30,00,00,000, matching the reference
 *     sheet's Group Revenue Target (`B16`) to the rupee.
 *   - That splits 9.5 : 20.5 into a Labour bucket and a Parts + External
 *     Sales + TGLOSS bucket — the same ratio behind the sheet's
 *     95,000,000 / 205,000,000 Group split (`AM10`/`AM11`).
 *   - Labour bucket splits 66% GS / 34% BP; Parts bucket splits 62% GS / 38%
 *     BP — both fixed constants confirmed by the user 2026-09-22 (sheet
 *     cells `AK16`/`AK17`/`AK18`/`AK19`), applied uniformly to every
 *     branch's own bucket (not redistributed bay-proportionally the way the
 *     reference sheet's Group total was — confirmed 2026-09-22).
 *   - TGLOSS Target is carved out of the GS Labour share. Reuses the
 *     branch's existing `vasBillTarget` (GUS RO MTD × 38% × Rs 3,000,
 *     report.ts) rather than a new figure — the user confirmed 2026-09-22
 *     this is "the correct way" to source it, in place of the reference
 *     sheet's own fixed-but-unsourced TGLOSS Target cells.
 *   - Ext Sales Target (5% of the branch's existing `partsRetailTarget`) is
 *     carved out evenly from the GS/BP Parts shares, same as the sheet.
 *
 * Profit Target follows the same shape as the existing `profitMtd` formula
 * in report.ts: 100% of Labour + 20% of (Parts + Ext Sales) + 38% of
 * TGLOSS, plus the branch's actual scrap/used-oil revenue as a straight
 * pass-through — matching the reference sheet's own Target column (`B20`),
 * which adds that same actual figure to both Target and MTD (net zero
 * effect on the achievement %, just keeps the two columns comparable).
 *
 * Both are null when the branch has no Slab 3 target loaded this month —
 * same "no ratio, drops out" rule the rest of the dashboard follows for any
 * missing target.
 */

const SLAB3_TO_REVENUE_TARGET = 30 / 32;
const LABOUR_BUCKET_SHARE = 9.5 / 30;
const PARTS_BUCKET_SHARE = 20.5 / 30;
const GS_LABOUR_SHARE = 0.66;
const BP_LABOUR_SHARE = 0.34;
const GS_PARTS_SHARE = 0.62;
const BP_PARTS_SHARE = 0.38;
const EXT_SALES_SHARE_OF_PARTS_RETAIL_TARGET = 0.05;

export type CeoRevenueTarget = {
  total: number;
  gsLabour: number;
  bpLabour: number;
  gsParts: number;
  bpParts: number;
  extSales: number;
  tgloss: number;
};

export type CeoProfitTarget = {
  total: number;
  partsProfit: number;
  labourProfit: number;
  tglossMargin: number;
};

export function computeBranchRevenueTarget(branch: BranchReport, slab3: number | undefined): CeoRevenueTarget | null {
  if (slab3 === undefined) return null;
  const total = slab3 * SLAB3_TO_REVENUE_TARGET;
  const labourBucket = total * LABOUR_BUCKET_SHARE;
  const partsBucket = total * PARTS_BUCKET_SHARE;
  const tgloss = branch.vasBillTarget ?? 0;
  const extSales = (branch.partsRetailTarget ?? 0) * EXT_SALES_SHARE_OF_PARTS_RETAIL_TARGET;
  const gsLabour = labourBucket * GS_LABOUR_SHARE - tgloss;
  const bpLabour = labourBucket * BP_LABOUR_SHARE;
  const gsParts = partsBucket * GS_PARTS_SHARE - extSales / 2;
  const bpParts = partsBucket * BP_PARTS_SHARE - extSales / 2;
  return { total, gsLabour, bpLabour, gsParts, bpParts, extSales, tgloss };
}

/** `scrapOilActualMtd` is the branch's real scrap + used-oil revenue this
 * month — see the doc comment above for why an actual figure belongs in a
 * Target computation. */
export function computeBranchProfitTarget(revenueTarget: CeoRevenueTarget, scrapOilActualMtd: number): CeoProfitTarget {
  const labourProfit = revenueTarget.gsLabour + revenueTarget.bpLabour;
  const partsProfit = 0.2 * (revenueTarget.gsParts + revenueTarget.bpParts + revenueTarget.extSales);
  const tglossMargin = 0.38 * revenueTarget.tgloss;
  return { labourProfit, partsProfit, tglossMargin, total: labourProfit + partsProfit + tglossMargin + scrapOilActualMtd };
}

export function sumRevenueTargets(targets: readonly (CeoRevenueTarget | null)[]): CeoRevenueTarget | null {
  const present = targets.filter((t): t is CeoRevenueTarget => t !== null);
  if (present.length === 0) return null;
  return present.reduce(
    (sum, t) => ({
      total: sum.total + t.total,
      gsLabour: sum.gsLabour + t.gsLabour,
      bpLabour: sum.bpLabour + t.bpLabour,
      gsParts: sum.gsParts + t.gsParts,
      bpParts: sum.bpParts + t.bpParts,
      extSales: sum.extSales + t.extSales,
      tgloss: sum.tgloss + t.tgloss,
    }),
    { total: 0, gsLabour: 0, bpLabour: 0, gsParts: 0, bpParts: 0, extSales: 0, tgloss: 0 },
  );
}

export function sumProfitTargets(targets: readonly (CeoProfitTarget | null)[]): CeoProfitTarget | null {
  const present = targets.filter((t): t is CeoProfitTarget => t !== null);
  if (present.length === 0) return null;
  return present.reduce(
    (sum, t) => ({
      total: sum.total + t.total,
      partsProfit: sum.partsProfit + t.partsProfit,
      labourProfit: sum.labourProfit + t.labourProfit,
      tglossMargin: sum.tglossMargin + t.tglossMargin,
    }),
    { total: 0, partsProfit: 0, labourProfit: 0, tglossMargin: 0 },
  );
}
