import { pool } from "../db";
import { checkDateColumnSanity, type DateSanityResult } from "../upload-date-sanity";

/**
 * Month-level date-sanity check (2026-09-24), same logic Service Info has
 * had since 2026-09-19 — see upload-date-sanity.ts. SSRV089 (Cost & Sales)
 * was TI01C's most repeated resend-the-wrong-file incident this month (see
 * duplicate-hash check in the upload route), so this closes the same gap
 * Service Info already had closed: a file whose invoices mostly belong to a
 * different month than the picked date is rejected before it's saved.
 */
const INVOICE_DOC_DATE_COLUMN = "Invoice Doc Date";
const INVOICE_DOC_NO_COLUMN = "Invoice Doc No.";

export function checkInvoiceDocDateSanity(rawRows: Record<string, unknown>[], claimedDate: string): DateSanityResult {
  // Invoice Doc Date is day-first (DD/MM/YYYY) — confirmed 2026-09-25
  // against real stored data ("14/01/2026" = 14 Jan), unlike Service Info's
  // month-first convention. See part-sale/upload-validation.ts for the
  // incident that surfaced this.
  return checkDateColumnSanity(rawRows, INVOICE_DOC_DATE_COLUMN, claimedDate, "invoice", "DD/MM/YYYY");
}

export type OverlapResult = { duplicate: false } | { duplicate: true; message: string };

/**
 * Partial-duplicate check (2026-10-05), mirroring service-info/upload-
 * validation.ts's checkRoOverlap and part-sale/upload-validation.ts's
 * checkBillOverlap — SSRV089 previously only had the exact-whole-file-hash
 * check, which a *partial* re-upload (extra or missing rows) slips past the
 * same way it did for those two report types before their own overlap
 * checks existed. Keyed on "Invoice Doc No." — the per-invoice reference,
 * same role Job Order No / BillNo play for the other two report types.
 */
export async function checkInvoiceOverlap(branch: string, rawRows: Record<string, unknown>[], claimedDate: string): Promise<OverlapResult> {
  const newInvoices = new Set<string>();
  for (const row of rawRows) {
    const inv = String(row[INVOICE_DOC_NO_COLUMN] ?? "").trim();
    if (inv) newInvoices.add(inv);
  }
  if (newInvoices.size === 0) return { duplicate: false };

  const { rows } = await pool.query<{ inv: string; last_date: string }>(
    `select row_data->>'Invoice Doc No.' as inv, max(date)::text as last_date
       from raw_upload_rows
      where report_type = 'ssrv089' and branch = $1 and date < $2
        and coalesce(trim(row_data->>'Invoice Doc No.'), '') <> ''
      group by row_data->>'Invoice Doc No.'`,
    [branch, claimedDate]
  );

  const priorDateByInvoice = new Map(rows.map((r) => [r.inv, r.last_date]));
  let overlapCount = 0;
  let mostRecentPriorDate: string | null = null;
  for (const inv of newInvoices) {
    const priorDate = priorDateByInvoice.get(inv);
    if (!priorDate) continue;
    overlapCount++;
    if (!mostRecentPriorDate || priorDate > mostRecentPriorDate) mostRecentPriorDate = priorDate;
  }

  const overlapPct = overlapCount / newInvoices.size;
  if (overlapPct < 0.5) return { duplicate: false };

  return {
    duplicate: true,
    message: `${Math.round(overlapPct * 100)}% of the invoices in this file (${overlapCount} of ${newInvoices.size}) were already uploaded${mostRecentPriorDate ? ` — most recently on ${mostRecentPriorDate}` : ""}. Are you sure this is new data?`,
  };
}
