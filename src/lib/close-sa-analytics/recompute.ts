import { tierForBranch } from "../branch-tier";
import { loadPartSaleDatesForRos, loadPartSaleRowsForRos, loadRawUploadRows, loadRoCloseSaPairs } from "../raw-upload-rows/store";
import { JOB_ORDER_NO_COLUMN } from "../service-info/parse";
import { computeCloseSaAnalytics, normalizeCloseSaName, normalizeRo } from "./compute";
import { saveCloseSaAnalyticsForDate } from "./store";

/**
 * Recomputes close_sa_analytics_daily for one branch across however many
 * dates are given, loading the branch's RO→Close SA map (loadRoCloseSaPairs
 * — the branch's whole Service Info history) only once rather than once per
 * date. Shared by recomputeCloseSaAnalytics (always a single date) and
 * catchUpPartSaleForClosedRos / the July-backfill script (often many dates
 * at once for the same branch), where reloading that map per date would be
 * wastefully slow — ~2.2s for the largest branch, per loadRoCloseSaPairs's
 * own doc comment, times however many dates need catching up.
 */
async function recomputeCloseSaAnalyticsForDates(branch: string, dates: string[]): Promise<void> {
  if (dates.length === 0) return;

  let tier: ReturnType<typeof tierForBranch>;
  let roCloseSaMap: Map<string, string>;
  try {
    tier = tierForBranch(branch);
    const roCloseSaPairs = await loadRoCloseSaPairs(branch);
    roCloseSaMap = new Map<string, string>();
    for (const { ro, sa } of roCloseSaPairs) {
      const normalizedRo = normalizeRo(ro);
      const normalizedSa = normalizeCloseSaName(sa);
      if (normalizedRo && normalizedSa && !roCloseSaMap.has(normalizedRo)) {
        roCloseSaMap.set(normalizedRo, normalizedSa);
      }
    }
  } catch (err) {
    console.error(`recomputeCloseSaAnalytics failed to load RO→SA map for ${branch}:`, err);
    return;
  }

  for (const date of dates) {
    try {
      const [serviceInfoRows, serviceInfoBpRows, labourSalesRows, partSaleRows] = await Promise.all([
        loadRawUploadRows("service_info", date, branch),
        loadRawUploadRows("service_info_bp", date, branch),
        loadRawUploadRows("labour_sales", date, branch),
        loadRawUploadRows("part_sale", date, branch),
      ]);

      // Tyre/battery and Parts ₹ (matched) are keyed to the ROs closing
      // TODAY, not to today's own Part Sale rows (see computeCloseSaAnalytics's
      // partSaleRowsForClosedRos doc comment) — so they need every Part Sale
      // row anywhere in history for those ROs, fetched fresh on every
      // recompute of this date.
      const closingRos = [
        ...new Set(
          [...serviceInfoRows, ...serviceInfoBpRows].map((row) => normalizeRo((row as Record<string, unknown>)[JOB_ORDER_NO_COLUMN])).filter(Boolean)
        ),
      ];
      const partSaleRowsForClosedRos = await loadPartSaleRowsForRos(branch, closingRos);

      const byCloseSa = computeCloseSaAnalytics(
        serviceInfoRows as Record<string, unknown>[],
        serviceInfoBpRows as Record<string, unknown>[],
        labourSalesRows as Record<string, unknown>[],
        partSaleRows as Record<string, unknown>[],
        tier,
        roCloseSaMap,
        partSaleRowsForClosedRos as Record<string, unknown>[]
      );
      await saveCloseSaAnalyticsForDate(branch, date, byCloseSa);
    } catch (err) {
      console.error(`recomputeCloseSaAnalytics failed for ${branch}/${date}:`, err);
    }
  }
}

/**
 * Keeps close_sa_analytics_daily fresh after any upload that can change it
 * for one branch/date: Service Info (GS or BP), Labour Sales, or Part Sale.
 * Always a full recompute for that branch/date from raw_upload_rows (cheap —
 * one day's rows, not the whole table), mirroring vas-revenue-real/
 * recompute.ts. Swallows its own errors so a recompute failure never fails
 * the upload it's attached to; the next relevant upload retries it.
 */
export async function recomputeCloseSaAnalytics(branch: string, date: string): Promise<void> {
  await recomputeCloseSaAnalyticsForDates(branch, [date]);
}

/**
 * Catches up Part Sale rows that landed before their RO had a Close SA at
 * all. Parts are issued by the parts team before the job closes (confirmed
 * with the user 2026-10-27), so a Part Sale row's date is routinely
 * recomputed — by the upload that just saved it — while `roCloseSaMap` still
 * has no entry for its RO. That recompute is never revisited once the RO
 * finally closes in Service Info, because recomputeCloseSaAnalytics only
 * ever runs for the date of whichever file was just uploaded.
 *
 * Only matters for the metrics still scoped to "parts billed this day" now
 * (DIY, engine flush, injector cleaner, synthetic oil, brake cleaning,
 * external sales) — tyre/battery and Parts ₹ (matched)/matched-RO count
 * (2026-10-28) are keyed to the RO's close date and re-fetched fresh from
 * the RO's whole Part Sale history on every recompute, so they're already
 * correct the moment Service Info is recomputed; this catch-up is redundant
 * for those but harmless (recomputeCloseSaAnalyticsForDates recomputes the
 * whole day either way).
 *
 * Call this right after a Service Info / Service Info (BP) upload with the
 * ROs that upload just saved — it finds every Part Sale date (this branch's
 * whole history) whose RefDocNo matches one of those ROs and re-runs the
 * normal per-date recompute for each, so parts sold before the job closed
 * finally pick up their SA. Safe to call with ROs that already had a Close
 * SA before today — the recompute is a full delete-then-insert for that
 * date, so re-running it is a no-op either way.
 */
export async function catchUpPartSaleForClosedRos(branch: string, ros: unknown[], justRecomputedDate: string): Promise<void> {
  try {
    const normalizedRos = [...new Set(ros.map(normalizeRo).filter(Boolean))];
    if (normalizedRos.length === 0) return;
    const dates = (await loadPartSaleDatesForRos(branch, normalizedRos)).filter((date) => date !== justRecomputedDate);
    await recomputeCloseSaAnalyticsForDates(branch, dates);
  } catch (err) {
    console.error(`catchUpPartSaleForClosedRos failed for ${branch}:`, err);
  }
}

/** Exposed for the one-off July-backfill script (scripts/backfill-close-sa-
 * part-sale-catchup.mts) — recomputes many dates for one branch while
 * loading the RO→SA map only once, same reasoning as catchUpPartSaleForClosedRos. */
export { recomputeCloseSaAnalyticsForDates };
