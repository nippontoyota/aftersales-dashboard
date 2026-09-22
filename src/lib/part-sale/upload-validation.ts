import { pool } from "../db";

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
