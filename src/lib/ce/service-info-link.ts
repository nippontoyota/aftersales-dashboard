import "server-only";
import { pool } from "@/lib/db";
import { extractServiceInfoVisits, LINK_SERVICE_INFO_VISITS_SQL, toServiceInfoLinkRecords } from "./service-info-visits";

/** Links a branch's daily Service Info visits into ce_leads, the one data
 * source ce_leads otherwise never sees (it's fed only by the annual UIO
 * workbook and the periodic DMS import) — see
 * project_mrs_n9_system.md for why this gap matters. The GS upload route
 * already hard-rejects BP-flavored files before this runs
 * (isBpFlavoredServiceInfo), so every row here is guaranteed GS — no
 * separate B&P exclusion needed, unlike the DMS importer. Best-effort,
 * same as every other post-upload step in service-info/route.ts — a
 * failure here must never block an otherwise-successful upload. For
 * historical uploads from before this hook existed, see
 * scripts/backfill-service-info-ce-link.mjs. */
export async function linkServiceInfoToCeLeads(rawRows: Record<string, unknown>[], branch: string): Promise<void> {
  try {
    const visits = extractServiceInfoVisits(rawRows, branch);
    if (!visits.length) return;
    await pool.query(LINK_SERVICE_INFO_VISITS_SQL, [JSON.stringify(toServiceInfoLinkRecords(visits))]);
  } catch (err) {
    console.error("Service Info → ce_leads linking failed", err);
  }
}
