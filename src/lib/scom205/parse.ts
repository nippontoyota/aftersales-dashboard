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
 * Column layout varies by branch export. The report has up to three column
 * groups, each [Units, Lab Rev, SP Rev] in that order: the branch's own
 * figures, a blank "compare against another dealer" group, and a "Total"
 * group. Confirmed 2026-08-29 against a real CO01A file: CO01B's export has
 * two groups (branch, then Total at column 5), CO01A's has the blank middle
 * group too, pushing Total to column 8.
 *
 * The group columns are located from the sub-header row (the "Units (Nos) /
 * Lab Rev. / SP Rev." row), not a fixed index. We read the "Total" group
 * first, but fall back to the branch-specific group when Total is blank:
 * TR01B's export changed format around 2026-09-03 and now fills only its
 * own columns, leaving the Total group empty (confirmed 2026-09-08 — it was
 * silently saving zeros). For a single-branch export the branch total *is*
 * the total, so the fallback is exact.
 */
const GUS_TOTAL_LABEL = "Total General Units Serviced";
const BPU_TOTAL_LABEL = "Total Body & Paint Units Serviced";
const TOTAL_GROUP_HEADER = "Total";
/** The header rows are always near the top, above 130+ data rows — searching
 * only this far keeps a "Total" / "Units (Nos)" appearing incidentally in
 * some later data cell from being mistaken for a header. */
const HEADER_SEARCH_ROWS = 12;

export type Scom205Totals = {
  gusSpRevMtd: number;
  gusLabRevMtd: number;
  bpuSpRevMtd: number;
  bpuLabRevMtd: number;
};

function findRowByLabel(rows: unknown[][], label: string): unknown[] | null {
  return rows.find((row) => String(row[0] ?? "").trim() === label) ?? null;
}

type ColumnGroup = { units: number; lab: number; sp: number };

/** Candidate [Units, Lab Rev, SP Rev] column groups, ordered so the "Total"
 * group is tried first and the branch-specific group is the fallback.
 * Returns null if the sub-header row can't be found at all. */
function findColumnGroups(rows: unknown[][]): ColumnGroup[] | null {
  const isUnits = (c: unknown) => /units\s*\(nos\)/i.test(String(c ?? ""));
  const isLabRev = (c: unknown) => /lab\s*rev/i.test(String(c ?? ""));
  const isSpRev = (c: unknown) => /sp\s*rev/i.test(String(c ?? ""));

  let subHeaderIdx = -1;
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_ROWS); i++) {
    const row = rows[i];
    if (row.some(isUnits) && row.some(isLabRev) && row.some(isSpRev)) {
      subHeaderIdx = i;
      break;
    }
  }
  if (subHeaderIdx === -1) return null;

  const starts: number[] = [];
  rows[subHeaderIdx].forEach((cell, idx) => {
    if (isUnits(cell)) starts.push(idx);
  });
  if (starts.length === 0) return null;

  // The group whose header (a row or two above the sub-header) literally reads "Total".
  let totalCol = -1;
  for (let i = subHeaderIdx; i >= Math.max(0, subHeaderIdx - 3); i--) {
    const col = rows[i].findIndex((cell) => String(cell ?? "").trim() === TOTAL_GROUP_HEADER);
    if (col !== -1) {
      totalCol = col;
      break;
    }
  }

  const ordered = [...starts].sort((a, b) => {
    if (totalCol !== -1 && a === totalCol) return -1;
    if (totalCol !== -1 && b === totalCol) return 1;
    return a - b;
  });
  return ordered.map((s) => ({ units: s, lab: s + 1, sp: s + 2 }));
}

/** First non-blank numeric value for `field` across the candidate groups —
 * "Total" group first, then the branch-specific fallback. Blank (`""`)
 * means "this group isn't filled", not zero, so it's skipped. */
function readAmount(row: unknown[], groups: ColumnGroup[], field: "lab" | "sp"): number {
  for (const g of groups) {
    const raw = String(row[g[field]] ?? "").replace(/,/g, "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
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
  return { totals: scom205TotalsFromRows(rows), rawRows: rows };
}

/** The revenue extraction, split out from the workbook read so a re-parse
 * can run straight off the stored `raw_upload_rows` without the original
 * file (see scripts/backfill-scom205-*.mjs). */
export function scom205TotalsFromRows(rows: unknown[][]): Scom205Totals {
  const gusRow = findRowByLabel(rows, GUS_TOTAL_LABEL);
  const bpuRow = findRowByLabel(rows, BPU_TOTAL_LABEL);

  if (!gusRow || !bpuRow) {
    throw new Error(
      `Could not find "${GUS_TOTAL_LABEL}" and "${BPU_TOTAL_LABEL}" rows — is this a scom205 Monthly KPI Report export?`
    );
  }

  const groups = findColumnGroups(rows);
  if (groups === null) {
    throw new Error(`Could not find the revenue column headers — is this a scom205 Monthly KPI Report export?`);
  }

  return {
    gusSpRevMtd: readAmount(gusRow, groups, "sp"),
    gusLabRevMtd: readAmount(gusRow, groups, "lab"),
    bpuSpRevMtd: readAmount(bpuRow, groups, "sp"),
    bpuLabRevMtd: readAmount(bpuRow, groups, "lab"),
  };
}
