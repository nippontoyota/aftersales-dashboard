import { normalizeCeVin } from "./parse.ts";

export type ServiceInfoVisit = { vin: string; visitDate: string; mileage: number; branch: string };

const text = (value: unknown) => String(value ?? "").trim();

/** Service Info rows use M/D/YYYY (e.g. "10/24/2026"), not the N-9
 * export's M/D/YY or the DMS export's Excel-serial dates — its own format
 * needs its own parser. */
export function dateOnly(value: unknown): string | null {
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
 * only the latest-dated visit per VIN within this batch, same "one visit
 * per vehicle" rule the DMS/UIO importers already use. No "server-only"
 * import here deliberately — this is pure parsing with no DB access, so
 * both the live upload hook (service-info-link.ts) and the historical
 * backfill script (which can't import a server-only module under plain
 * Node) can share it. */
export function extractServiceInfoVisits(rawRows: Record<string, unknown>[], branch: string): ServiceInfoVisit[] {
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

/** Same "only if newer" guard as the DMS importer: never lets an older
 * visit regress a fresher N/N1/N2 chain. Only ever UPDATEs an existing
 * ce_leads row matched by VIN, never INSERTs (ce_leads requires
 * sales_date/uio_year NOT NULL, which a service visit has no equivalent
 * of). Shared by the live hook and the backfill script so this SQL
 * exists in exactly one place. */
export const LINK_SERVICE_INFO_VISITS_SQL = `
  update ce_leads l set
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
  where l.vin = r.vin
`;

export function toServiceInfoLinkRecords(visits: ServiceInfoVisit[]) {
  return visits.map((visit) => ({
    vin: visit.vin,
    visit_date: visit.visitDate,
    mileage: visit.mileage,
    branch: visit.branch,
  }));
}
