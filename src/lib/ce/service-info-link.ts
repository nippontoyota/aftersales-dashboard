import "server-only";
import { pool } from "@/lib/db";
import { normalizeCeVin } from "./parse";

type ServiceInfoVisit = { vin: string; visitDate: string; mileage: number; branch: string };

const text = (value: unknown) => String(value ?? "").trim();

/** Service Info rows use M/D/YYYY (e.g. "10/24/2026"), not the N-9
 * export's M/D/YY or the DMS export's Excel-serial dates — its own format
 * needs its own parser. */
function dateOnly(value: unknown): string | null {
  const match = text(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** One row per job line, same RO can repeat across several lines — keep
 * only the latest-dated visit per VIN within this upload, same "one
 * visit per vehicle" rule the DMS/UIO importers already use. */
function extractVisits(rawRows: Record<string, unknown>[], branch: string): ServiceInfoVisit[] {
  const byVin = new Map<string, ServiceInfoVisit>();
  for (const row of rawRows) {
    const vin = normalizeCeVin(row["Vin no"]);
    if (!vin) continue;
    const visitDate = dateOnly(row["Job Close Date"]) ?? dateOnly(row["Invoice Date"]);
    if (!visitDate) continue;
    const mileageRaw = text(row["Mileage Out"]) || text(row["Mileage In"]);
    const mileage = Number(mileageRaw.replace(/,/g, ""));
    if (!Number.isFinite(mileage) || mileage <= 0) continue;

    const previous = byVin.get(vin);
    if (!previous || visitDate > previous.visitDate) byVin.set(vin, { vin, visitDate, mileage, branch });
  }
  return [...byVin.values()];
}

/** Links a branch's daily Service Info visits into ce_leads, the one data
 * source ce_leads otherwise never sees (it's fed only by the annual UIO
 * workbook and the periodic DMS import) — see
 * project_mrs_n9_system.md for why this gap matters. Only ever UPDATEs an
 * existing ce_leads row matched by VIN, never INSERTs: ce_leads requires
 * sales_date/uio_year (not null), which a service visit has no
 * equivalent of. The GS upload route already hard-rejects BP-flavored
 * files before this runs (isBpFlavoredServiceInfo), so every row here is
 * guaranteed GS — no separate B&P exclusion needed, unlike the DMS
 * importer. Same "only if newer" guard as that importer: never lets an
 * older visit regress a fresher N/N1/N2 chain. Best-effort, same as every
 * other post-upload step in service-info/route.ts — a failure here must
 * never block an otherwise-successful upload. */
export async function linkServiceInfoToCeLeads(rawRows: Record<string, unknown>[], branch: string): Promise<void> {
  try {
    const visits = extractVisits(rawRows, branch);
    if (!visits.length) return;
    const records = visits.map((visit) => ({
      vin: visit.vin,
      visit_date: visit.visitDate,
      mileage: visit.mileage,
      branch: visit.branch,
    }));
    await pool.query(
      `update ce_leads l set
         n2_dealer_code = case when r.visit_date > l.n_report_date then l.n1_dealer_code else l.n2_dealer_code end,
         n2_report_date = case when r.visit_date > l.n_report_date then l.n1_report_date else l.n2_report_date end,
         n2_mileage = case when r.visit_date > l.n_report_date then l.n1_mileage else l.n2_mileage end,
         n1_dealer_code = case when r.visit_date > l.n_report_date then l.n_dealer_code else l.n1_dealer_code end,
         n1_report_date = case when r.visit_date > l.n_report_date then l.n_report_date else l.n1_report_date end,
         n1_mileage = case when r.visit_date > l.n_report_date then l.n_mileage else l.n1_mileage end,
         n_dealer_code = case when r.visit_date > l.n_report_date then r.branch else l.n_dealer_code end,
         n_report_date = greatest(r.visit_date, l.n_report_date),
         n_mileage = case when r.visit_date > l.n_report_date then r.mileage else l.n_mileage end,
         avf = case when r.visit_date > l.n_report_date then (r.mileage - l.n_mileage) / 10000.0 else l.avf end,
         dms_import_id = case when r.visit_date > l.n_report_date then null else l.dms_import_id end
       from jsonb_to_recordset($1::jsonb) as r(vin text, visit_date date, mileage numeric, branch text)
       where l.vin = r.vin`,
      [JSON.stringify(records)],
    );
  } catch (err) {
    console.error("Service Info → ce_leads linking failed", err);
  }
}
