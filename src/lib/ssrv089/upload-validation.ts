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

export function checkInvoiceDocDateSanity(rawRows: Record<string, unknown>[], claimedDate: string): DateSanityResult {
  // Invoice Doc Date is day-first (DD/MM/YYYY) — confirmed 2026-09-25
  // against real stored data ("14/01/2026" = 14 Jan), unlike Service Info's
  // month-first convention. See part-sale/upload-validation.ts for the
  // incident that surfaced this.
  return checkDateColumnSanity(rawRows, INVOICE_DOC_DATE_COLUMN, claimedDate, "invoice", "DD/MM/YYYY");
}
