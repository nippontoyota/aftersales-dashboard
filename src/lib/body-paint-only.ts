/**
 * Split out of report.ts (2026-09-22) so client components can check this
 * without pulling in report.ts's server-only DB imports (pg et al.) at
 * module scope — report.ts re-exports both names from here so every
 * existing server-side importer keeps working unchanged.
 */
export const BODY_PAINT_ONLY_BRANCHES: ReadonlySet<string> = new Set(["CO01E", "KL01B", "TR01B"]);

export function isBodyPaintOnly(branch: string): boolean {
  return BODY_PAINT_ONLY_BRANCHES.has(branch);
}

/** CO01E (Kalamassery Body & Paint) has no VAS/Service Info of its own and
 * shares CO01B's city — its incentive slab thresholds were set as one
 * combined target with CO01B, not two separately achievable ones (confirmed
 * with the user 2026-09-19: viewed alone, neither branch's own revenue ever
 * clears its slabs). CO01E never gets its own row/target anywhere slabs are
 * tracked per branch — it always folds into CO01B. Originally private to
 * hero-kpi-strip.tsx; moved here 2026-09-28 so the VP's per-branch slab
 * table (vp-branch-slab-table.tsx) can apply the same rule instead of
 * showing CO01E as its own perpetually-targetless row. */
export const CO01B_SLAB_COMBINED_BRANCHES = ["CO01B", "CO01E"];
