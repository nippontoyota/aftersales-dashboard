import { recomputeCloseSaAnalytics } from "../close-sa-analytics/recompute";
import { recomputeVasRevenueReal } from "../vas-revenue-real/recompute";
import { recomputeUniqueVinVas } from "../unique-vin-vas/recompute";
import { recomputeTotalCarCareTreatments } from "../total-car-care/recompute";
import { recomputeCancelledAccessoriesAdjustmentForBranchMonth } from "../ssrv089/cancellation-adjustment";
import { recomputeCrossMonthReplacements } from "../cancellation/cross-month-replacement";
import { clearPendingRecompute, loadAllPendingRecomputes } from "./store";

export type ProcessPendingResult = {
  processedPairs: number;
  processedBranches: number;
  failures: { branch: string; date: string; error: string }[];
};

/** Runs every recompute a (branch, date) pair in pending_recomputes could
 * need, then clears that row — one pair at a time, so an interruption
 * partway through just leaves the remaining rows pending for the next run
 * (safe to call again, not all-or-nothing). Deliberately runs the FULL
 * suite for every pair rather than tracking which upload type triggered
 * each one: simpler and more robust than risking a missed recompute type,
 * and the redundant work this costs doesn't matter here — the whole point
 * of this batch is that it runs later, outside the automation's own
 * upload burst, not under time pressure. cross_month_replacements is
 * branch-scoped (not per date), so it runs once per unique branch in the
 * batch, after every pair's own recompute. */
export async function processPendingRecomputes(): Promise<ProcessPendingResult> {
  const pending = await loadAllPendingRecomputes();
  const result: ProcessPendingResult = { processedPairs: 0, processedBranches: 0, failures: [] };

  for (const { branch, date } of pending) {
    try {
      await recomputeVasRevenueReal(branch, date);
      await recomputeCloseSaAnalytics(branch, date);
      await recomputeUniqueVinVas(branch, date);
      await recomputeTotalCarCareTreatments(branch, date);
      await recomputeCancelledAccessoriesAdjustmentForBranchMonth(branch, date.slice(0, 7));
      await clearPendingRecompute(branch, date);
      result.processedPairs++;
    } catch (err) {
      result.failures.push({ branch, date, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const branches = [...new Set(pending.map((p) => p.branch))];
  for (const branch of branches) {
    try {
      await recomputeCrossMonthReplacements([branch]);
      result.processedBranches++;
    } catch (err) {
      result.failures.push({ branch, date: "(cross-month)", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
