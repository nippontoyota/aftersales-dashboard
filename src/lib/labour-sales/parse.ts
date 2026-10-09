import * as XLSX from "xlsx";

/**
 * Labour Sales Report (SSRV088_4) — one row per labour line on a repair
 * order: Job No. (the RO), Job Code/Desc, and both the pre- and
 * post-discount labour amount. Built 2026-10-06 to check actual billed VAS
 * revenue against the fixed price-list estimate in vas-price-list.ts (see
 * the CO01B/IR01A spot checks this was validated against first) — not wired
 * into any dashboard figure yet.
 *
 * Unlike every other report type here, branch and date are NOT simply "who
 * uploaded it and what they picked" — "Dealer Name"/"Branch Name" are always
 * "NIPPON TOYOTA" (so branch still has to come from the uploader), but the
 * user confirmed a real file can be a single day OR a cumulative multi-day
 * dump (expected during backfill), so every row's own "Doc. Date" column
 * decides which calendar date it belongs to. One upload can therefore
 * produce snapshots for many dates at once — see parseLabourSalesWorkbook's
 * return shape.
 */
const JOB_NO_COLUMN = "Job No.";
const DOC_DATE_COLUMN = "Doc. Date";
const JOB_CODE_COLUMN = "Job Code";
const JOB_DESC_COLUMN = "Job Desc.";
const SUB_TOTAL_BEFORE_COLUMN = "Sub Total (Labour)";
const SUB_TOTAL_AFTER_COLUMN = "Sub Total After Discount";

const REQUIRED_COLUMNS = [JOB_NO_COLUMN, DOC_DATE_COLUMN, JOB_CODE_COLUMN, JOB_DESC_COLUMN, SUB_TOTAL_BEFORE_COLUMN, SUB_TOTAL_AFTER_COLUMN];

const LABOUR_SALES_MAX_ROWS = 50_000;

/** General Service vs Body & Paint job numbers are distinguished by prefix
 * in this report (confirmed against CO01B's September data: every "BPJ"-
 * prefixed Job No. carried a "BP Line" marker, every "GSJ"-prefixed one
 * didn't, and BPJ's distinct-RO count matched BA Tool's BPUS almost exactly
 * — 433 vs 432). Kept only as an informational split, not a GUS substitute:
 * GSJ's own distinct-RO count did NOT reconcile cleanly against BA Tool's
 * GUS figure in that same check. */
function roPrefix(jobNo: string): "GS" | "BP" | null {
  if (jobNo.startsWith("GSJ")) return "GS";
  if (jobNo.startsWith("BPJ")) return "BP";
  return null;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Thousands-separated numbers ("1,315") same as elsewhere in this codebase — Number() alone rejects the comma. */
function parseAmount(value: unknown): number {
  const str = normalize(value).replace(/,/g, "");
  if (!str) return 0;
  const n = Number(str);
  return Number.isFinite(n) ? n : 0;
}

type SlashOrder = "DMY" | "MDY";

/** Days since 1899-12-30, same constant used everywhere else in this
 * codebase that converts an Excel serial date (e.g. upload-date-sanity.ts). */
function excelSerialToDate(serial: number): string | null {
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Picks day/month order from the file's OWN text values — same approach as
 * upload-date-sanity.ts's detectSlashDateFormat, reimplemented here because
 * this needs the full date (year-month-day), not just year-month. A
 * component > 12 can only be a day, so the first such row settles it;
 * defaults to DMY (every CSV Doc. Date sample seen so far is day-first)
 * when every row in the file is ambiguous. Only ever used for the text
 * fallback path — see resolveDocDate's doc comment for why a genuine xlsx
 * date cell never needs this at all. */
function detectSlashOrder(textRows: Record<string, unknown>[]): SlashOrder {
  for (const row of textRows) {
    const str = normalize(row[DOC_DATE_COLUMN]);
    const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
    if (!match) continue;
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (a > 12 && b <= 12) return "DMY";
    if (b > 12 && a <= 12) return "MDY";
  }
  return "DMY";
}

/** Text fallback — "DD/MM/YYYY"-or-"MM/DD/YY"-shaped, "-" or "/" separated,
 * 2- or 4-digit year (a 2-digit year is assumed 20YY — every real sample
 * seen so far is 2026). Returns YYYY-MM-DD, or null if unparseable. */
function parseSlashDateText(str: string, order: SlashOrder): string | null {
  const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (!match) return null;
  const [, a, b, yy] = match;
  const [dd, mm] = order === "DMY" ? [a, b] : [b, a];
  const day = Number(dd);
  const month = Number(mm);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const yyyy = yy.length === 2 ? `20${yy}` : yy;
  return `${yyyy}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

/**
 * Resolves one row's real date from BOTH how it reads natively (`rawValue` —
 * a genuine Excel date cell comes through as a plain serial number, no
 * guessing involved at all) and how it reads as forced text (`textValue`).
 *
 * Confirmed 2026-10-09 against a real branch's upload (CO01B's "LABOUR SALE
 * REPORT 08-10-26.xlsx", rejected with "no readable Doc. Date"): its Doc.
 * Date column is a true xlsx date cell, serial 46296 etc. — but formatted as
 * text it reads "10/1/26", a 2-digit-year, MONTH-FIRST string every row of
 * which has day ≤ 12 (so detectSlashOrder can't disambiguate it from the
 * text alone, and the CSV samples this parser was first built against were
 * all day-first — a silent wrong guess was the actual risk, not just a
 * parse failure). The exact serial sidesteps the ambiguity entirely, so it's
 * preferred whenever `isNativeSpreadsheet` is true (an actual .xlsx/.xls,
 * not a .csv — see parseLabourSalesWorkbook) and the row's raw value is
 * genuinely numeric. A CSV's `rawValue` can ALSO come through numeric
 * (xlsx's own CSV date-guessing — the exact risky behavior
 * service-info/parse.ts's raw:false comment already documents), so this
 * path is deliberately never trusted for a CSV — the text fallback (with
 * this module's own day/month detection) is used instead, unchanged from
 * before.
 */
function resolveDocDate(rawValue: unknown, textValue: unknown, isNativeSpreadsheet: boolean, order: SlashOrder): string | null {
  if (isNativeSpreadsheet && typeof rawValue === "number" && rawValue > 1000) {
    const fromSerial = excelSerialToDate(rawValue);
    if (fromSerial) return fromSerial;
  }
  return parseSlashDateText(normalize(textValue), order);
}

export type LabourSalesCounts = {
  rowCount: number;
  totalLabourBefore: number;
  totalLabourAfter: number;
  /** Job Code starting "99TG" — not yet excluding accessories-staff rows (see module doc comment). */
  vasLabourBefore: number;
  vasLabourAfter: number;
  gsRoCount: number;
  bpRoCount: number;
};

export type LabourSalesDaySnapshot = {
  date: string; // YYYY-MM-DD
  counts: LabourSalesCounts;
  rawRows: Record<string, unknown>[];
};

export type ParsedLabourSales = {
  days: LabourSalesDaySnapshot[];
  /** Rows whose Doc. Date couldn't be parsed at all — excluded from every day's counts/raw rows, surfaced so the uploader knows something didn't make it in. */
  skippedRowCount: number;
};

function findDataSheet(workbook: XLSX.WorkBook): { rowsRaw: Record<string, unknown>[]; rowsText: Record<string, unknown>[] } | null {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const headerRow = (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" })[0] ?? []).map((c) => String(c ?? "").trim());
    if (!REQUIRED_COLUMNS.every((col) => headerRow.includes(col))) continue;

    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    if (range.e.r >= LABOUR_SALES_MAX_ROWS) {
      throw new Error(`File has more than ${LABOUR_SALES_MAX_ROWS.toLocaleString()} rows — is this the right file?`);
    }
    // Read the sheet twice, same row order both times: `rowsRaw` keeps a
    // genuine date cell's native numeric serial (resolveDocDate's preferred,
    // unambiguous path for a real .xlsx/.xls); `rowsText` forces everything
    // to text, same reasoning as service-info/parse.ts's raw:false — a CSV's
    // own ambiguous date-guessing never gets a chance to run, and this is
    // also what every OTHER column (and what gets archived to
    // raw_upload_rows) uses regardless of date handling.
    const rowsRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const rowsText = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    return { rowsRaw, rowsText };
  }
  return null;
}

export function parseLabourSalesWorkbook(buffer: Buffer): ParsedLabourSales {
  const workbook = XLSX.read(buffer, { type: "buffer", sheetRows: LABOUR_SALES_MAX_ROWS + 1 });
  const found = findDataSheet(workbook);

  if (!found) {
    throw new Error(`Could not find a sheet with "${JOB_NO_COLUMN}", "${DOC_DATE_COLUMN}", "${JOB_CODE_COLUMN}", "${SUB_TOTAL_BEFORE_COLUMN}", and "${SUB_TOTAL_AFTER_COLUMN}" columns — is this a Labour Sales Report export?`);
  }
  if (found.rowsText.length === 0) {
    throw new Error("This file has the right columns but no data rows — looks like an empty export. Check the DMS pull and try again.");
  }
  // SheetJS's own "xlsx"/"xls"/"xlsb" (never set for a .csv, which has no
  // real cell typing at all — see resolveDocDate's doc comment on why that
  // distinction matters here).
  const isNativeSpreadsheet = workbook.bookType !== undefined;
  const { rowsRaw, rowsText } = found;
  const order = detectSlashOrder(rowsText);

  const byDate = new Map<string, Record<string, unknown>[]>();
  let skippedRowCount = 0;

  for (let i = 0; i < rowsText.length; i++) {
    const row = rowsText[i];
    const date = resolveDocDate(rowsRaw[i]?.[DOC_DATE_COLUMN], row[DOC_DATE_COLUMN], isNativeSpreadsheet, order);
    if (!date) {
      skippedRowCount++;
      continue;
    }
    const list = byDate.get(date) ?? [];
    list.push(row);
    byDate.set(date, list);
  }

  const days: LabourSalesDaySnapshot[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayRows]) => {
      const counts: LabourSalesCounts = {
        rowCount: dayRows.length,
        totalLabourBefore: 0,
        totalLabourAfter: 0,
        vasLabourBefore: 0,
        vasLabourAfter: 0,
        gsRoCount: 0,
        bpRoCount: 0,
      };
      const gsRos = new Set<string>();
      const bpRos = new Set<string>();

      for (const row of dayRows) {
        const before = parseAmount(row[SUB_TOTAL_BEFORE_COLUMN]);
        const after = parseAmount(row[SUB_TOTAL_AFTER_COLUMN]);
        counts.totalLabourBefore += before;
        counts.totalLabourAfter += after;

        const jobCode = normalize(row[JOB_CODE_COLUMN]);
        if (jobCode.startsWith("99TG")) {
          counts.vasLabourBefore += before;
          counts.vasLabourAfter += after;
        }

        const jobNo = normalize(row[JOB_NO_COLUMN]);
        const prefix = roPrefix(jobNo);
        if (prefix === "GS") gsRos.add(jobNo);
        else if (prefix === "BP") bpRos.add(jobNo);
      }

      counts.gsRoCount = gsRos.size;
      counts.bpRoCount = bpRos.size;

      return { date, counts, rawRows: dayRows };
    });

  return { days, skippedRowCount };
}
