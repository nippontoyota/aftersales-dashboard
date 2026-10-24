import { listAccessoriesStaffNamesForBranch } from "../accessories-staff-store";
import { loadRawUploadRows } from "../raw-upload-rows/store";
import { computeUniqueVinVas } from "./compute";
import { saveUniqueVinVasDaily } from "./store";

/**
 * Keeps unique_vin_vas_daily fresh after any Service Info (GS or BP) upload
 * touching one branch/date — always a full recompute from raw_upload_rows
 * (cheap, one day's rows), mirroring close-sa-analytics/recompute.ts and
 * vas-revenue-real/recompute.ts. Swallows its own errors so a recompute
 * failure never fails the upload it's attached to; the next relevant
 * upload retries it.
 */
export async function recomputeUniqueVinVas(branch: string, date: string): Promise<void> {
  try {
    const [serviceInfoRows, serviceInfoBpRows, staffNames] = await Promise.all([
      loadRawUploadRows("service_info", date, branch),
      loadRawUploadRows("service_info_bp", date, branch),
      listAccessoriesStaffNamesForBranch(branch),
    ]);
    const count = computeUniqueVinVas(
      serviceInfoRows as Record<string, unknown>[],
      serviceInfoBpRows as Record<string, unknown>[],
      staffNames
    );
    await saveUniqueVinVasDaily({ date, branch, count });
  } catch (err) {
    console.error(`recomputeUniqueVinVas failed for ${branch}/${date}:`, err);
  }
}
