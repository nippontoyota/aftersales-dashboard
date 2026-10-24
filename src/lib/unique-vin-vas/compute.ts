import { isAccessoriesStaff } from "../accessories-staff";
import { normalizeCloseSaName, normalizeRo } from "../close-sa-analytics/compute";
import { CLOSE_SA_NAME_COLUMN, JOB_CODE_COLUMN, JOB_ORDER_NO_COLUMN } from "../service-info/parse";
import { VAS_PRICE_BY_JOB_CODE } from "../vas-price-list";

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Unique VIN VAS — distinct ROs with at least one TGLOSS-priced job code
 * billed, that were NOT closed by an accessories-staff SA, for one
 * branch/date, GS + BP combined (confirmed with the user 2026-10-24: same
 * "pitched" TGLOSS definition as close-sa-analytics/compute.ts's
 * tglossPitchedRoCount, same accessories-staff roster already used to
 * exclude accessories ROs elsewhere).
 *
 * Plain RO count — no VIN dedup, at the user's explicit request (2026-10-24,
 * after comparing the two approaches on real October data: RO-wise gave
 * 5,720 company-wide vs a same-day-VIN-dedup approach's 5,699 — the user
 * picked the former, including the rare repeat-same-VIN-same-day cases).
 */
export function computeUniqueVinVas(
  serviceInfoRows: Record<string, unknown>[],
  serviceInfoBpRows: Record<string, unknown>[],
  accessoriesStaffNames: string[]
): number {
  const roInfo = new Map<string, { closeSaName: string; hasTgloss: boolean }>();

  for (const row of [...serviceInfoRows, ...serviceInfoBpRows]) {
    const ro = normalizeRo(row[JOB_ORDER_NO_COLUMN]);
    if (!ro) continue;
    let info = roInfo.get(ro);
    if (!info) {
      info = { closeSaName: normalizeCloseSaName(row[CLOSE_SA_NAME_COLUMN]), hasTgloss: false };
      roInfo.set(ro, info);
    }
    const jobCode = normalizeText(row[JOB_CODE_COLUMN]);
    if (VAS_PRICE_BY_JOB_CODE.has(jobCode)) info.hasTgloss = true;
  }

  let count = 0;
  for (const info of roInfo.values()) {
    if (!info.hasTgloss) continue;
    if (!info.closeSaName) continue;
    if (isAccessoriesStaff(accessoriesStaffNames, info.closeSaName)) continue;
    count++;
  }
  return count;
}
