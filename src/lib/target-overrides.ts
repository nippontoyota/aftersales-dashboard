/**
 * CO01B/CO01E BA Tool Target split (2026-09-24, at the user's request). The
 * BA Tool export lumps CO01E's whole BPU/Offtake/Parts Retail Target into
 * CO01B's row (BPUS Target 694, SPO Dealer Target ₹2,29,99,555.95, SPR
 * Internal Target ₹2,64,70,890 on 2026-09-23) and shows CO01E's own row as a
 * flat 0 for all three — the same root problem already hardcoded around for
 * the CEO dashboard's BP-bay-count split (see bay-capacity.ts). These are
 * the real per-branch splits, confirmed to sum exactly back to CO01B's raw
 * combined figures: 420+274=694, ₹1,47,19,716+₹82,79,840=₹2,29,99,556,
 * ₹1,69,41,370+₹95,29,520=₹2,64,70,890.
 *
 * Fixed numbers, not a computed ratio (at the user's explicit request) — a
 * new month's targets need a new override here, not an automatic rescale.
 * Scoped to 2026-09-01 onward only: before that, CO01E wasn't necessarily
 * operating as its own real unit (its own scom205 data only starts
 * 2026-09-01 too — see the branch-upload-coverage audit the same day), so
 * applying this split to earlier dates could misattribute target that was
 * legitimately CO01B's alone at the time.
 */
const TARGET_OVERRIDE_START_DATE = "2026-09-01";

export type BranchTargetOverride = {
  bpuTarget: number;
  offtakeTarget: number;
  partsRetailTarget: number;
};

const TARGET_OVERRIDES: Record<string, BranchTargetOverride> = {
  CO01B: { bpuTarget: 420, offtakeTarget: 14719716, partsRetailTarget: 16941370 },
  CO01E: { bpuTarget: 274, offtakeTarget: 8279840, partsRetailTarget: 9529520 },
};

/** Returns the override for this branch/date, or null when none applies —
 * callers fall back to the raw BA Tool value in that case. */
export function targetOverrideFor(branch: string, date: string): BranchTargetOverride | null {
  if (date < TARGET_OVERRIDE_START_DATE) return null;
  return TARGET_OVERRIDES[branch] ?? null;
}
