import { pool } from "../db";
import { checkDateColumnSanity, type DateSanityResult } from "../upload-date-sanity";

/**
 * Partial-duplicate warning for Part Sale uploads (2026-09-21), mirroring
 * service-info/upload-validation.ts's checkRoOverlap — added after IR01A's
 * "17 Sep" file turned out to be a mislabeled partial pull of the 18th (101
 * of the 18th's 321 rows, byte-identical, all carrying the 18th's own
 * SaleDate) that slipped past both existing checks: the exact-whole-file-hash
 * check (the two files weren't identical — the 18th had 220 more rows) and
 * the "already uploaded today" guard (different claimed dates). Same
 * "warn, don't block" contract as checkRoOverlap: a branch genuinely
 * combining several days into one cumulative export has high overlap with
 * its own prior days and must still go through when confirmed.
 */

const BILL_NO_COLUMN = "BillNo";
const SALE_DATE_COLUMN = "SaleDate";

/**
 * Month-level date-sanity check (2026-09-24), same logic Service Info has
 * had since 2026-09-19 — see upload-date-sanity.ts. Deliberately skipped for
 * TI01C and IR01A: their SaleDate column uses a confirmed non-standard
 * encoding (advances ~31 raw units/day, not a real Excel date serial — see
 * [[project_ti01c_part_sale_saledate_encoding]] memory), so running this
 * check against them would misread every date and reject valid uploads.
 * Revisit once that encoding is properly calibrated per branch.
 */
const SALE_DATE_CHECK_EXCLUDED_BRANCHES = new Set(["TI01C", "IR01A"]);

export function checkSaleDateSanity(branch: string, rawRows: Record<string, unknown>[], claimedDate: string): DateSanityResult {
  if (SALE_DATE_CHECK_EXCLUDED_BRANCHES.has(branch)) return { ok: true };
  // SaleDate is day-first (DD/MM/YYYY) — confirmed 2026-09-25 against real
  // stored data in both .csv and .xlsx exports ("15/09/2026" = 15 Sept),
  // unlike Service Info's month-first convention. A month-first read wrongly
  // rejected a real upload dated 24/09/2026 (misread as month "24").
  return checkDateColumnSanity(rawRows, SALE_DATE_COLUMN, claimedDate, "sale", "DD/MM/YYYY");
}

export type BillOverlapResult = { duplicate: false } | { duplicate: true; message: string };

export async function checkBillOverlap(
  branch: string,
  rawRows: Record<string, unknown>[],
  claimedDate: string
): Promise<BillOverlapResult> {
  const newBills = new Set<string>();
  for (const row of rawRows) {
    const bill = String(row[BILL_NO_COLUMN] ?? "").trim();
    if (bill) newBills.add(bill);
  }
  if (newBills.size === 0) return { duplicate: false };

  const { rows } = await pool.query<{ bill: string; last_date: string }>(
    `select row_data->>'BillNo' as bill, max(date)::text as last_date
       from raw_upload_rows
      where report_type = 'part_sale' and branch = $1 and date < $2
        and coalesce(trim(row_data->>'BillNo'), '') <> ''
      group by row_data->>'BillNo'`,
    [branch, claimedDate]
  );

  const priorDateByBill = new Map(rows.map((r) => [r.bill, r.last_date]));
  let overlapCount = 0;
  let mostRecentPriorDate: string | null = null;
  for (const bill of newBills) {
    const priorDate = priorDateByBill.get(bill);
    if (!priorDate) continue;
    overlapCount++;
    if (!mostRecentPriorDate || priorDate > mostRecentPriorDate) mostRecentPriorDate = priorDate;
  }

  const overlapPct = overlapCount / newBills.size;
  if (overlapPct < 0.5) return { duplicate: false };

  return {
    duplicate: true,
    message: `${Math.round(overlapPct * 100)}% of the bills in this file (${overlapCount} of ${newBills.size}) were already uploaded${mostRecentPriorDate ? ` — most recently on ${mostRecentPriorDate}` : ""}. Are you sure this is new data?`,
  };
}
