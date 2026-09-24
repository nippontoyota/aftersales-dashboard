import * as XLSX from "xlsx";

/**
 * Part Sale Report — one row per part sold. Unlike Service Info Report,
 * this file has no per-row branch column at all ("Branch name" and "Dealer
 * Name" are literally "NIPPON TOYOTA" on every row, dealer-group-wide) —
 * confirmed with the user that this file is still uploaded one-per-branch,
 * and branch/date come entirely from who's uploading and the date picked,
 * same as Service Info Report. Negative Sale Qty rows are returns/credit
 * notes and are confirmed to net against the day's total, not be excluded.
 */
const PART_NO_COLUMN = "PartNo";
const SALE_QTY_COLUMN = "Sale Qty";
const BILL_NO_COLUMN = "BillNo";
const NET_AMNT_COLUMN = "NetAmnt";
const REF_DOC_NO_COLUMN = "RefDocNo";
const CUSTOMER_NAME_COLUMN = "CustomerName";

/** Some branches' exports use a differently-punctuated header row for the
 * same columns (confirmed 2026-09-24, TR01B's "Parts Sales Report" file —
 * spaced/period-separated names instead of the standard SPRT014 ones, on an
 * otherwise identical row shape). Renamed to the canonical column name right
 * after the sheet is read so the rest of the parser never needs to know. */
const COLUMN_ALIASES: Record<string, string> = {
  "Part No.": PART_NO_COLUMN,
  "Qty.": SALE_QTY_COLUMN,
  "Bill No.": BILL_NO_COLUMN,
  "Net Amt.": NET_AMNT_COLUMN,
  "Ref. Doc. No.": REF_DOC_NO_COLUMN,
  "Cust. Name": CUSTOMER_NAME_COLUMN,
};

function applyColumnAliases(row: Record<string, unknown>): Record<string, unknown> {
  let hasAlias = false;
  for (const alias in COLUMN_ALIASES) {
    if (alias in row) {
      hasAlias = true;
      break;
    }
  }
  if (!hasAlias) return row;

  const renamed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    renamed[COLUMN_ALIASES[key] ?? key] = value;
  }
  return renamed;
}

const ENGINE_FLUSH_PARTS = ["A-08814-80061", "A-08814-80090"];
const INJECTOR_CLEANER_PARTS = ["A-08813-80100", "A-08813-80019"];
const SYNTHETIC_OIL_PARTS = [
  "L-0888-080073",
  "L-0888-080072",
  "L-0888-080071",
  "L-0888-084724",
  "L-0888-084726",
  "L-0888-084744",
  "L-0888-084746",
];
const BRAKE_CLEANING_SPRAY_PARTS = ["Z-9BCHP-00001"];

/** External Sales (2026-09-15 rule, replaces the old PartNo-prefix filter):
 *
 * A BillNo is `[type][branch-letter]26-NNNNN`. The type letter is what
 * matters: `A` = external sale (every branch — the branch letter is just
 * that branch's own fixed code, e.g. CO01B is `AA`, CO01A is `AB`, KL01A is
 * `AF` — informational only, the filter keys off the type letter alone).
 *
 * Every row on an `A`-type bill counts in full (its whole NetAmnt, no more
 * PartNo filtering), PLUS every row on an `F`-type bill (a return/credit
 * note) whose RefDocNo points back to an `A`-type bill — its NetAmnt is
 * already negative in the file, so adding it nets the return against the
 * original sale. Confirmed against real Sept 2026 data: every `F`-type row
 * on file so far has an `A`-type RefDocNo. */
const EXTERNAL_SALES_BILL_TYPE = "A";
const EXTERNAL_SALES_RETURN_BILL_TYPE = "F";

/** Whether an F-type row's original A-type bill should net against External
 * Sales. Always returns true — an FK return lands in the month it appears,
 * regardless of which month the original A-type bill was in. Since prior
 * months are locked once closed, a cross-month return has nowhere else to go
 * (2026-09-23, replaces the same-calendar-month-only rule added 2026-09-21). */
export type FTypeEligibility = (refDocNo: string) => boolean;

/** The resolver used at parse time and in backfill scripts: every F-type
 * return whose RefDocNo points to an A-type bill is always eligible. */
export const alwaysEligible: FTypeEligibility = () => true;

/** Opulent Auto Care Pvt Ltd is a vendor (buys parts from us for their own
 * use), not a revenue-generating customer — its rows never count toward
 * External Sales. Confirmed with the user 2026-09-12; "Opulent" is spelled
 * differently at every branch, so this matches by substring. Originally
 * patched into stored snapshots by a one-off script
 * (scripts/recompute-part-sale-external-excluding-opulent.mjs) layered on
 * top of the old PartNo-prefix rule; folded into the parser itself
 * 2026-09-15 so it survives the External Sales rule rewrite (and any
 * future one) instead of needing to be re-applied by hand. */
const EXCLUDED_CUSTOMER_SUBSTRINGS = ["opulent"];

function isExcludedCustomer(customerName: string): boolean {
  const normalized = customerName.toLowerCase();
  return EXCLUDED_CUSTOMER_SUBSTRINGS.some((needle) => normalized.includes(needle));
}

/** DIY — any row whose PartNo starts with "D-DIY" (e.g. "D-DIYRATS053",
 * "D-DIYKLPF001" — rat repellent spray, car perfume, that kind of small
 * retail item), independent of bill type. Shown as an additional
 * informational breakdown on the dashboard — confirmed with the user
 * 2026-08-31 that DIY rows on an external-type bill also legitimately count
 * toward External Sales; this isn't carved out of that total (and, since
 * 2026-09-15, External Sales no longer filters by PartNo at all — every row
 * on an `A`-type bill counts, DIY included), just broken out separately
 * alongside it. */
const DIY_PART_PREFIX = "D-DIY";

export type PartSaleCounts = {
  engineFlush: number;
  injectorCleaner: number;
  /** Already divided by 10 — this is litres, not raw Sale Qty. The DMS
   * records these parts' Sale Qty in tenths of a litre (confirmed with the
   * user 2026-09-04; was /100 until then). */
  syntheticOilLtrs: number;
  brakeCleaningSpray: number;
  /** Sum of NetAmnt for `A`-type bill rows plus matching `F`-type return rows, excluding Opulent (a vendor, not a customer) — the entire External Sales figure (see report.ts; BA Tool's SPR External is no longer used here as of 2026-09-15). */
  externalSales: number;
  /** Sum of Sale Qty for DIY rows. */
  diyCount: number;
  /** Sum of NetAmnt for DIY rows. */
  diyRevenue: number;
};

function normalizePart(value: unknown): string {
  return String(value ?? "").trim();
}

function toQty(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function isExternalSalesRow(billNo: string, refDocNo: string, isFTypeEligible: FTypeEligibility): boolean {
  const billType = billNo.charAt(0).toUpperCase();
  if (billType === EXTERNAL_SALES_BILL_TYPE) return true;
  if (billType === EXTERNAL_SALES_RETURN_BILL_TYPE) {
    return refDocNo.charAt(0).toUpperCase() === EXTERNAL_SALES_BILL_TYPE && isFTypeEligible(refDocNo);
  }
  return false;
}

/** XLSX (zip) starts with "PK\x03\x04"; legacy XLS (OLE2) with D0 CF 11 E0.
 * Anything else we treat as text (CSV) so it can be repaired before parse. */
function looksBinaryWorkbook(buffer: Buffer): boolean {
  return (
    (buffer[0] === 0x50 && buffer[1] === 0x4b) ||
    (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0)
  );
}

/**
 * The DMS "SPRT014" Part Sale Report CSV export wraps every field in double
 * quotes but never escapes a literal `"` that appears *inside* a field —
 * e.g. a part name like `MICROFIBER CLOTH 350GM 16" X 1`. A compliant CSV
 * reader (SheetJS included) then reads that `"` as the end of the field, so
 * every later column on the line shifts and the row usually swallows the
 * next one too. This doubles any such stray quote (`"` → `""`) so the value
 * survives. A well-formed CSV passes through unchanged; only ever run on
 * text (CSV) input, never on a real .xlsx/.xls.
 *
 * Works on a byte-preserving latin1 view so the buffer's real encoding is
 * still SheetJS's to detect afterwards — every char this touches (`"`, `,`,
 * CR, LF) is ASCII, so non-ASCII bytes pass through untouched.
 */
function repairCsvQuotes(buffer: Buffer): Buffer {
  const text = buffer.toString("latin1").replace(/^ï»¿/, ""); // drop UTF-8 BOM
  let out = "";
  let inQuoted = false; // inside a "…"-quoted field
  let atFieldStart = true; // next char begins a fresh field
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inQuoted) {
      if (atFieldStart && ch === '"') {
        inQuoted = true;
        atFieldStart = false;
      } else {
        atFieldStart = ch === "," || ch === "\r" || ch === "\n";
      }
      out += ch;
      continue;
    }
    if (ch !== '"') {
      out += ch;
      continue;
    }
    const next = text[i + 1];
    if (next === '"') {
      out += '""'; // already-escaped pair, keep as-is
      i++;
    } else if (next === undefined || next === "," || next === "\r" || next === "\n") {
      out += '"'; // legitimate closing quote
      inQuoted = false;
      atFieldStart = next === ",";
    } else {
      out += '""'; // stray literal quote inside the field — escape it
    }
  }
  return Buffer.from(out, "latin1");
}

export type ParsedPartSale = {
  counts: PartSaleCounts;
  /** Every row exactly as read from the file, every column (2026-09-01, at
   * the user's request) — see raw-upload-rows/store.ts. */
  rawRows: Record<string, unknown>[];
};

/** Parses the workbook into rows only — no counting — so the caller can
 * build the F-type eligibility resolver (needs branch + upload date) before
 * running the actual counts. */
export function parsePartSaleRows(buffer: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(looksBinaryWorkbook(buffer) ? buffer : repairCsvQuotes(buffer), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }).map(applyColumnAliases);

  if (rows.length === 0) {
    throw new Error("No rows found — is this a Part Sale Report export?");
  }
  if (!(PART_NO_COLUMN in rows[0]) || !(SALE_QTY_COLUMN in rows[0])) {
    throw new Error(`Expected "${PART_NO_COLUMN}" and "${SALE_QTY_COLUMN}" columns — is this a Part Sale Report export?`);
  }

  return rows;
}

export async function parsePartSaleWorkbook(buffer: Buffer, branch: string, uploadDate: string): Promise<ParsedPartSale> {
  const rows = parsePartSaleRows(buffer);
  return { counts: partSaleCountsFromRows(rows, alwaysEligible), rawRows: rows };
}

/** The counting, split out from the workbook read so a re-parse can run
 * straight off the stored `raw_upload_rows` (see scripts/backfill-part-sale-*).
 * `isFTypeEligible` decides, per RefDocNo, whether an F-type return's
 * original A-type bill is in the same month as this upload (see
 * external-sales-eligibility.ts) — callers must supply the real resolver;
 * there's no permissive default, so a caller that forgets it fails loud
 * rather than silently over- or under-counting. */
export function partSaleCountsFromRows(rows: Record<string, unknown>[], isFTypeEligible: FTypeEligibility): PartSaleCounts {
  let engineFlush = 0;
  let injectorCleaner = 0;
  let syntheticOilRaw = 0;
  let brakeCleaningSpray = 0;
  let externalSales = 0;
  let diyCount = 0;
  let diyRevenue = 0;

  for (const row of rows) {
    const part = normalizePart(row[PART_NO_COLUMN]);
    const qty = toQty(row[SALE_QTY_COLUMN]);
    if (ENGINE_FLUSH_PARTS.includes(part)) engineFlush += qty;
    else if (INJECTOR_CLEANER_PARTS.includes(part)) injectorCleaner += qty;
    else if (SYNTHETIC_OIL_PARTS.includes(part)) syntheticOilRaw += qty;
    else if (BRAKE_CLEANING_SPRAY_PARTS.includes(part)) brakeCleaningSpray += qty;

    const billNo = normalizePart(row[BILL_NO_COLUMN]);
    const refDocNo = normalizePart(row[REF_DOC_NO_COLUMN]);
    const customerName = normalizePart(row[CUSTOMER_NAME_COLUMN]);
    if (isExternalSalesRow(billNo, refDocNo, isFTypeEligible) && !isExcludedCustomer(customerName)) {
      externalSales += toQty(row[NET_AMNT_COLUMN]);
    }

    if (part.toUpperCase().startsWith(DIY_PART_PREFIX)) {
      diyCount += qty;
      diyRevenue += toQty(row[NET_AMNT_COLUMN]);
    }
  }

  return {
    engineFlush,
    injectorCleaner,
    syntheticOilLtrs: syntheticOilRaw / 10,
    brakeCleaningSpray,
    externalSales,
    diyCount,
    diyRevenue,
  };
}
