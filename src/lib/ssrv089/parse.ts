import * as XLSX from "xlsx";
import { isAccessoriesStaff } from "../accessories-staff";

/**
 * SSRV089 Cost & Sales Report — one row per job-order line item (some rows
 * are supplementary supply-doc lines with blank Part Sale/Labour Sale, see
 * real data). Confirmed with the user: sum `Part Sale` and `Labour Sale`
 * for rows where `Close SA Name` is an Accessories-department staff member
 * for the uploading branch (see accessories-staff.ts) — that day's
 * Accessories Part Sale / Accessories Labour Sale, which feeds the GUS
 * Parts/Labour MTD formula (see scom205/parse.ts and report.ts).
 *
 * The real report data isn't always sheet 1 — confirmed 2026-08-29 against
 * a real TR01C export that silently computed ₹0: sheet 1 was a pivot-table
 * summary someone built for their own reference (columns like "Sum of Part
 * Sale"/"Values", no "Close SA Name" at all), with the actual 2,500+ row
 * export sitting in a second sheet. Always reading sheet 1 read the wrong
 * one. So every sheet is checked for a real "Close SA Name" column, using
 * whichever one actually has it, rather than assuming sheet order.
 */
const CLOSE_SA_NAME_COLUMN = "Close SA Name";
const PART_SALE_COLUMN = "Part Sale";
const LABOUR_SALE_COLUMN = "Labour Sale";
const PART_SALE_ALIAS = "Parts Sale";
const BRAND_COLUMN = "Brand(Toyota/Grey)";
const SSRV089_MAX_ROWS = 20_000;

export type Ssrv089Totals = {
  accessoriesPartSale: number;
  accessoriesLabourSale: number;
  /** Grey-brand (non-Toyota) Part/Labour Sale, summed across every row
   * regardless of Close SA Name — unlike the Accessories totals above, this
   * isn't staff-scoped. Confirmed 2026-10-01 (TI01A): scom205's GUS Sp/Lab
   * Rev MTD excludes Grey-brand transactions entirely, so without this a
   * Grey job's revenue doesn't show up anywhere on the dashboard. Only
   * added into GUS Parts/Labour MTD for branches in report.ts's
   * GREY_REVENUE_BRANCHES (TI01A only for now) — computed here for every
   * branch regardless, same "store it, wire it in later" approach as the
   * rest of this file. */
  greyPartSale: number;
  greyLabourSale: number;
};

export type ParsedSsrv089 = {
  totals: Ssrv089Totals;
  /** Every row exactly as read from the file, every column (2026-09-01, at
   * the user's request) — see raw-upload-rows/store.ts. */
  rawRows: Record<string, unknown>[];
};

function toAmount(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Checks the HEADER row independently of row count (2026-10-05 — same fix
 * applied to service-info/parse.ts and already present in ssrv089-bp/
 * parse.ts). The old version required `column in rows[0]`, which can't see a
 * header at all once there are zero data rows — so an empty-but-correctly-
 * headed file and an actually-wrong report type produced the identical
 * "could not find a column" message. Treats the "Parts Sale" alias (see
 * below) as equivalent to "Part Sale" for this check alone — the rename
 * itself still happens on the real rows further down. */
function sheetHeaderMatches(sheet: XLSX.WorkSheet): boolean {
  const header = (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" })[0] ?? []).map((c) => String(c ?? "").trim());
  const hasPartSale = header.includes(PART_SALE_COLUMN) || header.includes(PART_SALE_ALIAS);
  return header.includes(CLOSE_SA_NAME_COLUMN) && hasPartSale && header.includes(LABOUR_SALE_COLUMN);
}

function findDataSheet(workbook: XLSX.WorkBook): { rows: Record<string, unknown>[] } | null {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // All three, not just "Close SA Name" alone — a pivot-table summary
    // sheet can legitimately have "Close SA Name" as a cell value too (its
    // filter label, e.g. "Close SA Name: (Multiple Items)"), which becomes
    // a column key the same way a real header would once read with
    // headers-from-row-1. It won't also have real Part Sale/Labour Sale
    // columns, which is what actually distinguishes real transaction data.
    if (!sheetHeaderMatches(sheet)) continue;

    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
    if (range.e.r >= SSRV089_MAX_ROWS) {
      throw new Error(`File has more than ${SSRV089_MAX_ROWS.toLocaleString()} rows — is this the right file?`);
    }
    // raw: false (2026-09-25, after a false-rejected MV01A upload) — without
    // it, xlsx's own CSV type-guessing silently mis-parses an ambiguous
    // dash/slash date string (e.g. "02-03-2026") as MM-DD-YYYY whenever the
    // day is ≤12, turning it into a wrong Excel serial number before this
    // code ever sees it — corrupting Invoice Doc Date for most rows in a
    // file and tripping the date-sanity check with scattered wrong months.
    // raw:false makes xlsx hand back the original text instead. Confirmed
    // safe for Part Sale/Labour Sale and Close SA Name too — identical
    // totals before/after against two real branch exports.
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    // Some branch exports (2026-09-28, IR01A) label the column "Parts Sale"
    // (and "Parts Cost ") instead of "Part Sale". Rename to the canonical
    // spelling in place so both downstream readers and the stored raw rows
    // (read by the cancellation SQL as row_data->>'Part Sale') stay uniform.
    for (const row of rows) {
      if (PART_SALE_ALIAS in row && !(PART_SALE_COLUMN in row)) {
        row[PART_SALE_COLUMN] = row[PART_SALE_ALIAS];
        delete row[PART_SALE_ALIAS];
      }
    }
    return { rows };
  }
  return null;
}

export function parseSsrv089Workbook(buffer: Buffer, staffNames: string[]): ParsedSsrv089 {
  const workbook = XLSX.read(buffer, { type: "buffer", sheetRows: SSRV089_MAX_ROWS + 1 });
  const found = findDataSheet(workbook);

  if (!found) {
    throw new Error(`Could not find a sheet with a "${CLOSE_SA_NAME_COLUMN}" column — is this an SSRV089 Cost & Sales Report export?`);
  }
  if (found.rows.length === 0) {
    throw new Error("This file has the right columns but no data rows — looks like an empty export. Check the DMS pull and try again.");
  }
  const { rows } = found;

  let accessoriesPartSale = 0;
  let accessoriesLabourSale = 0;
  let greyPartSale = 0;
  let greyLabourSale = 0;

  for (const row of rows) {
    const closeSaName = String(row[CLOSE_SA_NAME_COLUMN] ?? "");
    if (isAccessoriesStaff(staffNames, closeSaName)) {
      accessoriesPartSale += toAmount(row[PART_SALE_COLUMN]);
      accessoriesLabourSale += toAmount(row[LABOUR_SALE_COLUMN]);
    }
    const brand = String(row[BRAND_COLUMN] ?? "").trim().toUpperCase();
    if (brand === "GREY") {
      greyPartSale += toAmount(row[PART_SALE_COLUMN]);
      greyLabourSale += toAmount(row[LABOUR_SALE_COLUMN]);
    }
  }

  return { totals: { accessoriesPartSale, accessoriesLabourSale, greyPartSale, greyLabourSale }, rawRows: rows };
}
