import { isAccessoriesStaff } from "../accessories-staff";
import { normalizeCloseSaName, normalizeRo } from "../close-sa-analytics/compute";
import { CLOSE_SA_NAME_COLUMN, JOB_CODE_COLUMN, JOB_ORDER_NO_COLUMN } from "../service-info/parse";
import { VAS_PRICE_BY_JOB_CODE } from "../vas-price-list";

const VIN_COLUMN = "Vin no";

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function normalizeVin(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

/**
 * Unique VIN VAS — distinct vehicles (Vin no) with at least one TGLOSS-
 * priced job code billed on an RO that was NOT closed by an accessories-
 * staff SA, for one branch/date, GS + BP combined (confirmed with the user
 * 2026-10-24: same "pitched" TGLOSS definition as close-sa-analytics/
 * compute.ts's tglossPitchedRoCount, same accessories-staff roster already
 * used to exclude accessories ROs elsewhere).
 *
 * A plain distinct-VIN count for a single (date, branch) already gives the
 * right same-day collapsing rule for free: several qualifying ROs for the
 * same VIN on this one day (even split across GS and BP) land on the same
 * Set entry and count once. Cross-day (or cross-branch) repeats are never
 * deduped here — that's left to the caller summing this day's count into
 * an MTD total, so a later day's occurrence of the same VIN adds again.
 */
export function computeUniqueVinVas(
  serviceInfoRows: Record<string, unknown>[],
  serviceInfoBpRows: Record<string, unknown>[],
  accessoriesStaffNames: string[]
): number {
  const roInfo = new Map<string, { closeSaName: string; vin: string; hasTgloss: boolean }>();

  for (const row of [...serviceInfoRows, ...serviceInfoBpRows]) {
    const ro = normalizeRo(row[JOB_ORDER_NO_COLUMN]);
    if (!ro) continue;
    let info = roInfo.get(ro);
    if (!info) {
      info = {
        closeSaName: normalizeCloseSaName(row[CLOSE_SA_NAME_COLUMN]),
        vin: normalizeVin(row[VIN_COLUMN]),
        hasTgloss: false,
      };
      roInfo.set(ro, info);
    }
    const jobCode = normalizeText(row[JOB_CODE_COLUMN]);
    if (VAS_PRICE_BY_JOB_CODE.has(jobCode)) info.hasTgloss = true;
  }

  const vins = new Set<string>();
  for (const info of roInfo.values()) {
    if (!info.hasTgloss) continue;
    if (!info.closeSaName) continue;
    if (isAccessoriesStaff(accessoriesStaffNames, info.closeSaName)) continue;
    if (info.vin) vins.add(info.vin);
  }
  return vins.size;
}
