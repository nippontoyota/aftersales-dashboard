import { listAccessoriesStaffNamesForBranch } from "../accessories-staff-store";
import { loadServiceInfoSnapshot } from "../service-info/store";
import { loadServiceInfoBpSnapshot } from "../service-info-bp/store";
import { computeVasRevenueReal, VAS_REAL_CUTOVER_DATE } from "./compute";
import { saveVasRevenueReal } from "./store";

/**
 * Keeps vas_revenue_real fresh after any upload that can change it for one
 * branch/date: a Service Info Report (GS or BP) upload, or a Labour Sales
 * Report upload touching that date (see that route — it can touch many
 * dates in one upload, so it calls this once per date). A no-op before the
 * cutover (see compute.ts) — earlier months are never computed or stored
 * here at all, so report.ts's own cutover check always finds nothing to
 * read for them and falls back to the old calculation untouched.
 *
 * Swallows its own errors rather than letting a recompute failure fail an
 * otherwise-successful upload — this is a secondary, derived figure, not
 * the upload itself; the next relevant upload (from either side) retries it
 * naturally. Logged to stderr so a real, recurring failure is still visible.
 */
export async function recomputeVasRevenueReal(branch: string, date: string): Promise<void> {
  if (date < VAS_REAL_CUTOVER_DATE) return;
  try {
    const [staffNames, gsSnapshot, bpSnapshot] = await Promise.all([
      listAccessoriesStaffNamesForBranch(branch),
      loadServiceInfoSnapshot(date, branch),
      loadServiceInfoBpSnapshot(date, branch),
    ]);
    // Old price-list totals for this one day, GS and BP separately — the
    // fallback compute.ts uses for whichever side has nothing at all in
    // raw_upload_rows for this branch/date (see usedDayAggregateFallback's
    // doc comment for why this has to stay split instead of combined).
    const gsAggregateVasRevenue = gsSnapshot?.counts.vasRevenue ?? 0;
    const bpAggregateVasRevenue = bpSnapshot?.counts.vasRevenue ?? 0;
    const result = await computeVasRevenueReal(branch, date, staffNames, gsAggregateVasRevenue, bpAggregateVasRevenue);
    await saveVasRevenueReal({ date, branch, ...result });
  } catch (err) {
    console.error(`recomputeVasRevenueReal failed for ${branch}/${date}:`, err);
  }
}
