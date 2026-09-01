import * as XLSX from "xlsx";

/**
 * scom205 Monthly KPI Report — confirmed with the user: only sheet 1
 * ("Customer Traffic & Revenue Flow") matters, sheets 2/3 are unused. Values
 * in this file are already month-to-date cumulative (unlike SSRV089, which
 * is daily), so there's nothing to accumulate here — just read the two
 * pre-totaled rows directly:
 *   - "Total General Units Serviced" -> feeds GUS Parts/Labour MTD (after
 *     subtracting the Accessories total from SSRV089 — see report.ts)
 *   - "Total Body & Paint Units Serviced" -> BPU Parts/Labour MTD directly,
 *     no subtraction
 *
 * Column layout varies by branch export — confirmed 2026-08-29 against a
 * real CO01A file after it silently saved zeros: CO01B's export has just
 * two column groups (branch-specific, then Total, starting at column
 * index 5), but CO01A's has an extra blank middle group (a "compare
 * against another dealer" column set that's unused for a single-branch
 * export), pushing its real Total group to column index 8. A fixed column
 * index is wrong in general, so the Total group's start column is located
 * from the header row itself (the row whose cells literally read "Total")
 * rather than assumed — each group is always [Units, Lab Rev, SP Rev] in
 * that order, confirmed against both real exports.
 */
const GUS_TOTAL_LABEL = "Total General Units Serviced";
const BPU_TOTAL_LABEL = "Total Body & Paint Units Serviced";
const TOTAL_GROUP_HEADER = "Total";
/** The header row is always near the top, above 130+ data rows — searching
 * only this far keeps a "Total" appearing incidentally in some later data
 * cell from being mistaken for the header. */
const HEADER_SEARCH_ROWS = 10;

export type Scom205Totals = {
  gusSpRevMtd: number;
  gusLabRevMtd: number;
  bpuSpRevMtd: number;
  bpuLabRevMtd: number;
};

function toAmount(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function findRowByLabel(rows: unknown[][], label: string): unknown[] | null {
  return rows.find((row) => String(row[0] ?? "").trim() === label) ?? null;
}

/** The "Total" column group's starting column — its 3 columns are always
 * [Units, Lab Rev, SP Rev], same order as every other column group in this
 * report. Returns null if no header row says "Total" at all, so the caller
 * can fail loudly instead of quietly reading the wrong (or a blank) column. */
function findTotalGroupStartColumn(rows: unknown[][]): number | null {
  for (const row of rows.slice(0, HEADER_SEARCH_ROWS)) {
    const col = row.findIndex((cell) => String(cell ?? "").trim() === TOTAL_GROUP_HEADER);
    if (col !== -1) return col;
  }
  return null;
}

export type ParsedScom205 = {
  totals: Scom205Totals;
  /** Every row exactly as read from the file — this report has no reliable
   * column headers (see the module doc comment above), so each raw row is
   * kept as its raw cell array rather than a keyed object (2026-09-01, at
   * the user's request) — see raw-upload-rows/store.ts. */
  rawRows: unknown[][];
};

export function parseScom205Workbook(buffer: Buffer): ParsedScom205 {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true });

  const gusRow = findRowByLabel(rows, GUS_TOTAL_LABEL);
  const bpuRow = findRowByLabel(rows, BPU_TOTAL_LABEL);

  if (!gusRow || !bpuRow) {
    throw new Error(
      `Could not find "${GUS_TOTAL_LABEL}" and "${BPU_TOTAL_LABEL}" rows — is this a scom205 Monthly KPI Report export?`
    );
  }

  const totalUnitsCol = findTotalGroupStartColumn(rows);
  if (totalUnitsCol === null) {
    throw new Error(`Could not find the "${TOTAL_GROUP_HEADER}" column group — is this a scom205 Monthly KPI Report export?`);
  }
  const labRevCol = totalUnitsCol + 1;
  const spRevCol = totalUnitsCol + 2;

  return {
    totals: {
      gusSpRevMtd: toAmount(gusRow[spRevCol]),
      gusLabRevMtd: toAmount(gusRow[labRevCol]),
      bpuSpRevMtd: toAmount(bpuRow[spRevCol]),
      bpuLabRevMtd: toAmount(bpuRow[labRevCol]),
    },
    rawRows: rows,
  };
}
