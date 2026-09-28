import { loadAllServiceInfoSnapshotsForMonthUpTo } from "./service-info/store";
import { loadAllServiceInfoBpSnapshotsForMonthUpTo } from "./service-info-bp/store";
import type { LabourItemCounts } from "@/app/vp/vp-compare-data";

/**
 * Month-to-date Wheel Alignment / Balancing / Brake Skimming per branch,
 * kept separately for General Service and Body & Paint (2026-09-28, for the
 * VP's Labour popups). BranchReport only carries the two added together, so
 * this reads the two Service Info tables directly — the plain GS loader
 * (not the merged one), same as gus-per-car-trend.ts's GUS-only VAS counts.
 * A branch with no snapshot on a side is simply null there.
 */
export async function loadVpLabourItems(date: string): Promise<Record<string, LabourItemCounts>> {
  const [gs, bp] = await Promise.all([loadAllServiceInfoSnapshotsForMonthUpTo(date), loadAllServiceInfoBpSnapshotsForMonthUpTo(date)]);

  const out: Record<string, LabourItemCounts> = {};
  const row = (branch: string) =>
    (out[branch] ??= { wheelAlignmentGs: null, wheelBalancingGs: null, brakeSkimmingGs: null, wheelAlignmentBp: null, wheelBalancingBp: null, brakeSkimmingBp: null });
  const add = (current: number | null, n: number) => (current ?? 0) + n;

  for (const s of gs) {
    const r = row(s.branch);
    r.wheelAlignmentGs = add(r.wheelAlignmentGs, s.counts.wheelAlignment);
    r.wheelBalancingGs = add(r.wheelBalancingGs, s.counts.wheelBalancing);
    r.brakeSkimmingGs = add(r.brakeSkimmingGs, s.counts.brakeSkimming);
  }
  for (const s of bp) {
    const r = row(s.branch);
    r.wheelAlignmentBp = add(r.wheelAlignmentBp, s.counts.wheelAlignment);
    r.wheelBalancingBp = add(r.wheelBalancingBp, s.counts.wheelBalancing);
    r.brakeSkimmingBp = add(r.brakeSkimmingBp, s.counts.brakeSkimming);
  }
  return out;
}
