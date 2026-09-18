import type { IncentiveSlabTargets } from "./store";

/**
 * Sums Slab 1-4 targets across a set of branches — used for a region or
 * "All" scope, where there's no single branch's own thresholds to compare
 * against. Same numbers the source Excel's own region/company subtotal rows
 * held (verified against "Q3 Slab wise target.xlsx" 2026-09-18); summing the
 * already-parsed per-branch rows here instead of parsing those subtotal rows
 * directly, since it's robust to which branches actually have a target this
 * month rather than trusting the file's own row layout.
 *
 * Undefined if none of `branchCodes` have a target loaded — same "no ratio,
 * drops out" rule the rest of the dashboard follows for a missing target,
 * rather than silently comparing against a target of zero.
 */
export function aggregateIncentiveSlabTargets(
  targets: Record<string, IncentiveSlabTargets>,
  branchCodes: readonly string[]
): IncentiveSlabTargets | undefined {
  const present = branchCodes.map((code) => targets[code]).filter((t): t is IncentiveSlabTargets => t !== undefined);
  if (present.length === 0) return undefined;
  return present.reduce(
    (sum, t) => ({ slab1: sum.slab1 + t.slab1, slab2: sum.slab2 + t.slab2, slab3: sum.slab3 + t.slab3, slab4: sum.slab4 + t.slab4 }),
    { slab1: 0, slab2: 0, slab3: 0, slab4: 0 }
  );
}
