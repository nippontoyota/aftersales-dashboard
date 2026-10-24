import { isAccessoriesStaff } from "../accessories-staff";
import { normalizeCloseSaName, normalizeRo } from "../close-sa-analytics/compute";
import { CLOSE_SA_NAME_COLUMN, JOB_CODE_COLUMN, JOB_ORDER_NO_COLUMN } from "../service-info/parse";
import { VAS_PRICE_BY_JOB_CODE } from "../vas-price-list";

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Total Car Care Treatments — every TGLOSS-priced job-code LINE billed
 * (VAS_PRICE_BY_JOB_CODE), on an RO that was NOT closed by an accessories-
 * staff SA, for one branch/date, GS + BP combined (confirmed with the user
 * 2026-10-24). Unlike unique-vin-vas/compute.ts's RO count, this is NOT
 * deduped per RO — an RO with 3 different TGLOSS treatments on it counts
 * as 3 "treatments", which is the whole point of this metric being
 * distinct from Unique VIN VAS. Includes every TGLOSS treatment type —
 * Mech Care included, per the user's request to drop the template's old
 * "(w/o Mech Care)" wording, which previously excluded it.
 */
export function computeTotalCarCareTreatments(
  serviceInfoRows: Record<string, unknown>[],
  serviceInfoBpRows: Record<string, unknown>[],
  accessoriesStaffNames: string[]
): number {
  const closeSaByRo = new Map<string, string>();
  for (const row of [...serviceInfoRows, ...serviceInfoBpRows]) {
    const ro = normalizeRo(row[JOB_ORDER_NO_COLUMN]);
    if (!ro) continue;
    if (!closeSaByRo.has(ro)) closeSaByRo.set(ro, normalizeCloseSaName(row[CLOSE_SA_NAME_COLUMN]));
  }

  let count = 0;
  for (const row of [...serviceInfoRows, ...serviceInfoBpRows]) {
    const ro = normalizeRo(row[JOB_ORDER_NO_COLUMN]);
    if (!ro) continue;
    const jobCode = normalizeText(row[JOB_CODE_COLUMN]);
    if (!VAS_PRICE_BY_JOB_CODE.has(jobCode)) continue;
    const closeSaName = closeSaByRo.get(ro) ?? "";
    if (!closeSaName) continue;
    if (isAccessoriesStaff(accessoriesStaffNames, closeSaName)) continue;
    count++;
  }
  return count;
}
