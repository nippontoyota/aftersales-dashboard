import { recomputeCloseSaAnalyticsForDates } from "../close-sa-analytics/recompute";
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
  /** True if the time budget ran out with pending pairs still unprocessed —
   * safe, since every pair clears independently; the rest just wait for the
   * next run (the daily cron, or another click of the HQ button). */
  ranOutOfTime: boolean;
};

// Vercel's hard ceiling is maxDuration (300s on both the /data route and the
// cron route that call this) — stop well before that so a single oversized
// branch mid-flight doesn't get killed with nothing to show for it, and so
// there's still time left for the cross_month_replacements pass below.
const TIME_BUDGET_MS = 240_000;

/** Runs every recompute a pending_recomputes row could need, then clears it
 * — grouped by branch so each branch's own expensive, branch-scoped lookups
 * (the RO→Close SA map in particular, ~2.2s for the largest branch — see
 * recomputeCloseSaAnalyticsForDates's doc comment) are loaded once per
 * branch for this whole run, not once per pending date. Previously this
 * called the single-date recomputeCloseSaAnalytics per pair in a flat loop
 * — for a branch with, say, 15 pending dates, that reloaded the same
 * branch-wide history 15 times, which is what was pushing a single run past
 * Vercel's 300s ceiling (confirmed against three timed-out /data invocations
 * on 2026-11-25, right when the automation's own uploads were also failing
 * — see the session this was diagnosed in). cancelled_accessories_adjustments
 * is similarly deduped to once per (branch, month) instead of once per
 * (branch, date), since it's a whole-month recompute either way.
 *
 * recomputeVasRevenueReal/recomputeUniqueVinVas/recomputeTotalCarCareTreatments
 * stay per-date — each is a cheap single-day query (per their own doc
 * comments), not worth the extra risk of a bigger refactor for a marginal
 * gain. */
export async function processPendingRecomputes(): Promise<ProcessPendingResult> {
  const start = Date.now();
  const pending = await loadAllPendingRecomputes();
  const result: ProcessPendingResult = { processedPairs: 0, processedBranches: 0, failures: [], ranOutOfTime: false };

  const datesByBranch = new Map<string, string[]>();
  for (const { branch, date } of pending) {
    const dates = datesByBranch.get(branch);
    if (dates) dates.push(date);
    else datesByBranch.set(branch, [date]);
  }

  const branchesProcessed: string[] = [];
  for (const [branch, dates] of datesByBranch) {
    if (Date.now() - start > TIME_BUDGET_MS) {
      result.ranOutOfTime = true;
      break;
    }
    branchesProcessed.push(branch);

    for (const date of dates) {
      try {
        await recomputeVasRevenueReal(branch, date);
        await recomputeUniqueVinVas(branch, date);
        await recomputeTotalCarCareTreatments(branch, date);
      } catch (err) {
        result.failures.push({ branch, date, error: err instanceof Error ? err.message : String(err) });
      }
    }

    try {
      await recomputeCloseSaAnalyticsForDates(branch, dates);
    } catch (err) {
      result.failures.push({ branch, date: "(close-sa-analytics, all pending dates)", error: err instanceof Error ? err.message : String(err) });
    }

    const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
    for (const month of months) {
      try {
        await recomputeCancelledAccessoriesAdjustmentForBranchMonth(branch, month);
      } catch (err) {
        result.failures.push({ branch, date: `(cancelled-accessories, ${month})`, error: err instanceof Error ? err.message : String(err) });
      }
    }

    for (const date of dates) {
      await clearPendingRecompute(branch, date);
      result.processedPairs++;
    }
  }

  for (const branch of branchesProcessed) {
    try {
      await recomputeCrossMonthReplacements([branch]);
      result.processedBranches++;
    } catch (err) {
      result.failures.push({ branch, date: "(cross-month)", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
