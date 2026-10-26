import { tierForBranch } from "../branch-tier";
import { loadRawUploadRows, loadRoCloseSaPairs } from "../raw-upload-rows/store";
import { computeCloseSaAnalytics, normalizeCloseSaName, normalizeRo } from "./compute";
import { saveCloseSaAnalyticsForDate } from "./store";

/**
 * Keeps close_sa_analytics_daily fresh after any upload that can change it
 * for one branch/date: Service Info (GS or BP), Labour Sales, or Part Sale.
 * Always a full recompute for that branch/date from raw_upload_rows (cheap —
 * one day's rows, not the whole table), mirroring vas-revenue-real/
 * recompute.ts. Swallows its own errors so a recompute failure never fails
 * the upload it's attached to; the next relevant upload retries it.
 */
export async function recomputeCloseSaAnalytics(branch: string, date: string): Promise<void> {
  try {
    const [serviceInfoRows, serviceInfoBpRows, labourSalesRows, partSaleRows, roCloseSaPairs] = await Promise.all([
      loadRawUploadRows("service_info", date, branch),
      loadRawUploadRows("service_info_bp", date, branch),
      loadRawUploadRows("labour_sales", date, branch),
      loadRawUploadRows("part_sale", date, branch),
      loadRoCloseSaPairs(branch),
    ]);
    const tier = tierForBranch(branch);
    const roCloseSaMap = new Map<string, string>();
    for (const { ro, sa } of roCloseSaPairs) {
      const normalizedRo = normalizeRo(ro);
      const normalizedSa = normalizeCloseSaName(sa);
      if (normalizedRo && normalizedSa && !roCloseSaMap.has(normalizedRo)) {
        roCloseSaMap.set(normalizedRo, normalizedSa);
      }
    }
    const byCloseSa = computeCloseSaAnalytics(
      serviceInfoRows as Record<string, unknown>[],
      serviceInfoBpRows as Record<string, unknown>[],
      labourSalesRows as Record<string, unknown>[],
      partSaleRows as Record<string, unknown>[],
      tier,
      roCloseSaMap
    );
    await saveCloseSaAnalyticsForDate(branch, date, byCloseSa);
  } catch (err) {
    console.error(`recomputeCloseSaAnalytics failed for ${branch}/${date}:`, err);
  }
}
