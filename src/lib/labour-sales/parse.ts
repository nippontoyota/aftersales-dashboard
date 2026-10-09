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

/** Picks day/month order from the file's OWN data — same approach as
 * upload-date-sanity.ts's detectSlashDateFormat, reimplemented here because
 * this needs the full date (year-month-day), not just year-month. A
 * component > 12 can only be a day, so the first such row settles it;
 * defaults to DMY (every real Doc. Date sample seen so far is day-first)
 * when every row in the file is ambiguous. */
function detectSlashOrder(rawRows: Record<string, unknown>[]): SlashOrder {
  for (const row of rawRows) {
    const str = normalize(row[DOC_DATE_COLUMN]);
    const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!match) continue;
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (a > 12 && b <= 12) return "DMY";
    if (b > 12 && a <= 12) return "MDY";
  }
  return "DMY";
}

/** Returns YYYY-MM-DD, or null if unparseable. */
function parseDocDate(raw: unknown, order: SlashOrder): string | null {
  const str = normalize(raw);
  const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!match) return null;
  const [, a, b, yyyy] = match;
  const [dd, mm] = order === "DMY" ? [a, b] : [b, a];
  const day = Number(dd);
  const month = Number(mm);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
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

function findDataSheet(workbook: XLSX.WorkBook): { rows: Record<string, unknown>[] } | null {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const headerRow = (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" })[0] ?? []).map((c) => String(c ?? "").trim());
    if (!REQUIRED_COLUMNS.every((col) => headerRow.includes(col))) continue;

    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    if (range.e.r >= LABOUR_SALES_MAX_ROWS) {
      throw new Error(`File has more than ${LABOUR_SALES_MAX_ROWS.toLocaleString()} rows — is this the right file?`);
    }
    // raw: false, same reasoning as service-info/parse.ts — Doc. Date is
    // read and parsed as plain text below (parseDocDate), never left to
    // xlsx's own ambiguous date guessing.
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    return { rows };
  }
  return null;
}

export function parseLabourSalesWorkbook(buffer: Buffer): ParsedLabourSales {
  const workbook = XLSX.read(buffer, { type: "buffer", sheetRows: LABOUR_SALES_MAX_ROWS + 1 });
  const found = findDataSheet(workbook);

  if (!found) {
    throw new Error(`Could not find a sheet with "${JOB_NO_COLUMN}", "${DOC_DATE_COLUMN}", "${JOB_CODE_COLUMN}", "${SUB_TOTAL_BEFORE_COLUMN}", and "${SUB_TOTAL_AFTER_COLUMN}" columns — is this a Labour Sales Report export?`);
  }
  if (found.rows.length === 0) {
    throw new Error("This file has the right columns but no data rows — looks like an empty export. Check the DMS pull and try again.");
  }
  const { rows } = found;
  const order = detectSlashOrder(rows);

  const byDate = new Map<string, Record<string, unknown>[]>();
  let skippedRowCount = 0;

  for (const row of rows) {
    const date = parseDocDate(row[DOC_DATE_COLUMN], order);
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
