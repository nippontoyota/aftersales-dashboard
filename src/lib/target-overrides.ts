/**
 * CO01B/CO01E BA Tool Target split (2026-09-24, at the user's request). The
 * BA Tool export lumps CO01E's whole BPU/Offtake/Parts Retail Target into
 * CO01B's row and shows CO01E's own row as a flat 0 for all three — the same
 * root problem already hardcoded around for the CEO dashboard's BP-bay-count
 * split (see bay-capacity.ts).
 *
 * Fixed numbers per month (not a computed ratio, at the user's explicit
 * request) — both BA Tool's combined figure and the real per-branch split
 * change every month, so each month needs its own confirmed entry here
 * rather than reusing or rescaling a previous month's.
 *
 * Scoped to 2026-09-01 onward only: before that, CO01E wasn't necessarily
 * operating as its own real unit (its own scom205 data only starts
 * 2026-09-01 too — see the branch-upload-coverage audit the same day), so
 * applying a split to earlier dates could misattribute target that was
 * legitimately CO01B's alone at the time.
 */
export const TARGET_OVERRIDE_START_DATE = "2026-09-01";

export type BranchTargetOverride = {
  bpuTarget: number;
  offtakeTarget: number;
  partsRetailTarget: number;
};

// Keyed by month ("YYYY-MM"), then branch. Each month's pair is confirmed to
// sum back to BA Tool's combined CO01B row for that month:
// 2026-09: 420+274=694 BPU, ₹1,47,19,716+₹82,79,840=₹2,29,99,556 Offtake,
//          ₹1,69,41,370+₹95,29,520=₹2,64,70,890 Parts Retail
// 2026-10: 420+247=667 BPU, ₹1,37,11,274+₹84,03,684=₹2,21,14,958 Offtake,
//          ₹1,57,80,722+₹96,72,056=₹2,54,52,778 Parts Retail
const TARGET_OVERRIDES_BY_MONTH: Record<string, Record<string, BranchTargetOverride>> = {
  "2026-09": {
    CO01B: { bpuTarget: 420, offtakeTarget: 14719716, partsRetailTarget: 16941370 },
    CO01E: { bpuTarget: 274, offtakeTarget: 8279840, partsRetailTarget: 9529520 },
  },
  "2026-10": {
    CO01B: { bpuTarget: 420, offtakeTarget: 13711274, partsRetailTarget: 15780722 },
    CO01E: { bpuTarget: 247, offtakeTarget: 8403684, partsRetailTarget: 9672056 },
  },
};

/** Returns the override for this branch/date, or null when none applies —
 * callers fall back to the raw BA Tool value in that case. */
export function targetOverrideFor(branch: string, date: string): BranchTargetOverride | null {
  if (date < TARGET_OVERRIDE_START_DATE) return null;
  const month = date.slice(0, 7);
  return TARGET_OVERRIDES_BY_MONTH[month]?.[branch] ?? null;
}
