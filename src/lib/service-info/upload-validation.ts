import { pool } from "../db";
import { checkDateColumnSanity, parseDateToYearMonth, type DateSanityResult } from "../upload-date-sanity";

/**
 * Two safety checks added 2026-09-19 after three real incidents (KL01A and
 * CO01A each had a whole month's data re-uploaded under a second, wrong
 * date; TI01B had a partial re-upload) slipped through undetected — two of
 * the three went through HQ's Upload Sheet tool, which had no duplicate or
 * date-sanity check of any kind before this.
 *
 * Both checks run against the raw parsed rows (Record<string, unknown>[]
 * from parseServiceInfoWorkbook), keyed by the file's own column names.
 *
 * The month-level date-sanity logic itself moved to upload-date-sanity.ts
 * (2026-09-24), generalized so Part Sale and SSRV089 can reuse the exact
 * same "wrong month, not just wrong day" check instead of each reimplementing
 * it — see that module's doc comment for the reasoning behind the month-level
 * (not day-level) threshold.
 */

const INVOICE_DATE_COLUMN = "Invoice Date";
const JOB_ORDER_COLUMN = "Job Order No";

export { parseDateToYearMonth, type DateSanityResult };

/** Part 1 — Service Info's own column name, delegating to the shared check. */
export function checkInvoiceDateSanity(rawRows: Record<string, unknown>[], claimedDate: string): DateSanityResult {
  return checkDateColumnSanity(rawRows, INVOICE_DATE_COLUMN, claimedDate, "invoice");
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
