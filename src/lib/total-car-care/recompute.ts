import { listAccessoriesStaffNamesForBranch } from "../accessories-staff-store";
import { loadRawUploadRows } from "../raw-upload-rows/store";
import { computeTotalCarCareTreatments } from "./compute";
import { saveTotalCarCareTreatmentsDaily } from "./store";

/**
 * Keeps total_car_care_treatments_daily fresh after any Service Info (GS
 * or BP) upload touching one branch/date — always a full recompute from
 * raw_upload_rows (cheap, one day's rows), mirroring unique-vin-vas/
 * recompute.ts. Swallows its own errors so a recompute failure never fails
 * the upload it's attached to; the next relevant upload retries it.
 */
export async function recomputeTotalCarCareTreatments(branch: string, date: string): Promise<void> {
  try {
    const [serviceInfoRows, serviceInfoBpRows, staffNames] = await Promise.all([
      loadRawUploadRows("service_info", date, branch),
      loadRawUploadRows("service_info_bp", date, branch),
      listAccessoriesStaffNamesForBranch(branch),
    ]);
    const count = computeTotalCarCareTreatments(
      serviceInfoRows as Record<string, unknown>[],
      serviceInfoBpRows as Record<string, unknown>[],
      staffNames
    );
    await saveTotalCarCareTreatmentsDaily({ date, branch, count });
  } catch (err) {
    console.error(`recomputeTotalCarCareTreatments failed for ${branch}/${date}:`, err);
  }
}
