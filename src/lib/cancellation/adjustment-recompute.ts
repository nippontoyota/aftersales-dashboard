import {
  listCancellationRevenueMonthsForBranch,
  recomputeCancelledAccessoriesAdjustmentForBranchMonth,
} from "../ssrv089/cancellation-adjustment";
import { recomputeCrossMonthReplacements } from "./cross-month-replacement";

/**
 * Keeps cancelled_accessories_adjustments and cross_month_replacements (see
 * db/schema.sql's 2026-10-01 comment) fresh after the two kinds of upload
 * that can change what they hold. Both precomputed tables used to be live
 * queries against raw_upload_rows run on every /dashboard, /ceo and /queries
 * page load — moved here so that cost is paid once per upload instead of
 * once per page view (see this file's callers in the SSRV089 and
 * cancellation upload routes).
 */

/** After an SSRV089-General upload for one branch+date: only that
 * branch+month's accessories adjustment can have changed, so recompute is
 * scoped to just that — cheap regardless of raw_upload_rows' total size. */
export async function recomputeAfterSsrv089Upload(branch: string, date: string): Promise<void> {
  const month = date.slice(0, 7);
  await recomputeCancelledAccessoriesAdjustmentForBranchMonth(branch, month);
  // A replacement is always matched within one branch (same join condition
  // as the cancelled invoice's own branch), so scoping to just this branch
  // is both correct and what keeps this cheap — see
  // computeCrossMonthReplacementsFresh's doc comment.
  await recomputeCrossMonthReplacements([branch]);
}

/** After an SSRV089-BP upload for one branch+date: no accessories-staff
 * deduction (that's GS-only — Accessories-staff matching has never covered
 * BP), but a cross-month replacement can now be matched against a BP job
 * (ref GSJ.../BPE... ROs are looked up across both report types as of
 * 2026-10-07 — see reconcile.ts and cross-month-replacement.ts), so the
 * same recompute still needs to run. */
export async function recomputeAfterSsrv089BpUpload(branch: string): Promise<void> {
  await recomputeCrossMonthReplacements([branch]);
}

/** After a cancellation report upload for one or more branches: a new or
 * changed cancellation can affect any revenue month that branch has ever had
 * a cancellation in (not just the upload's own cancel-month), so every such
 * month is recomputed — still cheap, since invoice_cancellations per branch
 * is a small set. */
export async function recomputeAfterCancellationUpload(branches: string[]): Promise<void> {
  const uniqueBranches = [...new Set(branches)];
  for (const branch of uniqueBranches) {
    const months = await listCancellationRevenueMonthsForBranch(branch);
    for (const month of months) {
      await recomputeCancelledAccessoriesAdjustmentForBranchMonth(branch, month);
    }
  }
  if (uniqueBranches.length > 0) {
    await recomputeCrossMonthReplacements(uniqueBranches);
  }
}
