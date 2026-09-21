import { pool } from "../db";

/**
 * Two safety checks added 2026-09-19 after three real incidents (KL01A and
 * CO01A each had a whole month's data re-uploaded under a second, wrong
 * date; TI01B had a partial re-upload) slipped through undetected — two of
 * the three went through HQ's Upload Sheet tool, which had no duplicate or
 * date-sanity check of any kind before this.
 *
 * Both checks run against the raw parsed rows (Record<string, unknown>[]
 * from parseServiceInfoWorkbook), keyed by the file's own column names.
 */

const INVOICE_DATE_COLUMN = "Invoice Date";
const JOB_ORDER_COLUMN = "Job Order No";

/** Matches numbers with thousands separators, e.g. "1,529" — same pattern
 * ba-tool/parse.ts uses for the same reason (Number() rejects the comma). */
const THOUSANDS_SEPARATED = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;

/**
 * The Service Info Report's date columns come through as either a raw Excel
 * serial number (e.g. "46023", from .xlsx/.xls uploads) or "MM/DD/YYYY" text
 * (from .csv uploads) — confirmed 2026-09-19 by sampling real data across
 * branches, no single format holds. Returns a YYYY-MM string (just the
 * month, which is all these checks need) or null if unparseable/blank.
 */
export function parseDateToYearMonth(raw: unknown): string | null {
  const str = String(raw ?? "").trim();
  if (!str) return null;

  // Excel serial date: days since 1899-12-30. 25569 is the offset to the
  // Unix epoch (1970-01-01) — same constant used everywhere else in this
  // codebase that has had to make this exact conversion.
  const asNumber = THOUSANDS_SEPARATED.test(str) ? Number(str.replace(/,/g, "")) : Number(str);
  if (Number.isFinite(asNumber) && asNumber > 1000) {
    const utcDays = Math.floor(asNumber - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 7);
  }

  // "MM/DD/YYYY" (also tolerates single-digit month/day)
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, mm, , yyyy] = match;
    return `${yyyy}-${mm.padStart(2, "0")}`;
  }

  return null;
}

export type DateSanityResult = { ok: true } | { ok: false; error: string };

/**
 * Part 1 — rejects a file whose invoices mostly belong to a different
 * calendar month than the date the uploader picked. Deliberately a
 * month-level check, not a tight day-level window: a live daily upload's
 * invoices are trivially the same day (and so the same month), but a
 * legitimate month-end backfill upload's invoices are spread across the
 * *whole* month it's backfilling (confirmed against KL01A's real January
 * backfill — 100% of its ~3,658 rows were January-dated despite the upload
 * being tagged "2026-01-01", not clustered near day 1). A day-level window
 * would have wrongly rejected that legitimate upload. A month-level check
 * still catches the actual incident that prompted this (CO01A's file was
 * 100% January invoices tagged "2026-07-31" — wrong month, not just wrong
 * day) without false-positiving on real backfills.
 */
export function checkInvoiceDateSanity(rawRows: Record<string, unknown>[], claimedDate: string): DateSanityResult {
  const claimedMonth = claimedDate.slice(0, 7);
  let withDate = 0;
  let matching = 0;
  const monthCounts = new Map<string, number>();

  for (const row of rawRows) {
    const month = parseDateToYearMonth(row[INVOICE_DATE_COLUMN]);
    if (!month) continue;
    withDate++;
    if (month === claimedMonth) matching++;
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  }

  // Nothing to check against (every row blank/unparseable) — don't block on
  // a signal we don't have.
  if (withDate === 0) return { ok: true };

  if (matching / withDate >= 0.5) return { ok: true };

  const topMonths = [...monthCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([month, count]) => `${month} (${count} row${count === 1 ? "" : "s"})`)
    .join(", ");

  return {
    ok: false,
    error: `This file's invoices don't match ${claimedDate} — most are dated ${topMonths}. Check the date and try again, or if this is a historical backfill, tag it with a date in the month the invoices actually belong to.`,
  };
}

export type OverlapResult = { duplicate: false } | { duplicate: true; message: string };

/**
 * Part 2 — warns (not blocks) when a large share of this file's repair
 * orders already exist somewhere in this branch's upload history, on any
 * earlier date. Broader than the existing exact-whole-file-hash check
 * (service-info/route.ts's own duplicate-detection, kept as-is for its more
 * specific "identical to your upload from X" message) — this also catches a
 * *partial* re-upload like TI01B's, where 302 of 333 ROs (91%) were repeats
 * but the file wasn't byte-identical to any single prior upload.
 */
export async function checkRoOverlap(branch: string, rawRows: Record<string, unknown>[], claimedDate: string): Promise<OverlapResult> {
  const newRos = new Set<string>();
  for (const row of rawRows) {
    const ro = String(row[JOB_ORDER_COLUMN] ?? "").trim();
    if (ro) newRos.add(ro);
  }
  if (newRos.size === 0) return { duplicate: false };

  const { rows } = await pool.query<{ ro: string; last_date: string }>(
    `select row_data->>'Job Order No' as ro, max(date)::text as last_date
       from raw_upload_rows
      where report_type = 'service_info' and branch = $1 and date < $2
        and coalesce(trim(row_data->>'Job Order No'), '') <> ''
      group by row_data->>'Job Order No'`,
    [branch, claimedDate]
  );

  const priorDateByRo = new Map(rows.map((r) => [r.ro, r.last_date]));
  let overlapCount = 0;
  let mostRecentPriorDate: string | null = null;
  for (const ro of newRos) {
    const priorDate = priorDateByRo.get(ro);
    if (!priorDate) continue;
    overlapCount++;
    if (!mostRecentPriorDate || priorDate > mostRecentPriorDate) mostRecentPriorDate = priorDate;
  }

  const overlapPct = overlapCount / newRos.size;
  if (overlapPct < 0.5) return { duplicate: false };

  return {
    duplicate: true,
    message: `${Math.round(overlapPct * 100)}% of the repair orders in this file (${overlapCount} of ${newRos.size}) were already uploaded${mostRecentPriorDate ? ` — most recently on ${mostRecentPriorDate}` : ""}. Are you sure this is new data?`,
  };
}
