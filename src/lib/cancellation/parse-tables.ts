/**
 * Layout parsing for the Tax Invoice Cancellation Report — split out from
 * parse.ts (which owns the PDF extraction) so it can be unit-tested against a
 * captured pdf-parse `getTable()` result without pulling in pdfjs.
 *
 * The report is one table with these columns (as getTable() resolves them):
 *
 *   SI.No | Cancel Date/Time | DocNo. | Issue Date | RefDoc.No | RefDoc.Date
 *   | Owner/Code Name | Doc.Customer | RegNo. | Total Sales Before Tax | Tax
 *   | Tot Sales After Tax | Cancel By | Cancel Reason
 *
 * The branch and the month aren't per-row — they come from the header block
 * the report prints once at the top ("CO01B NIPPON TOYOTA", "01082026
 * 31082026 ..."). A file is normally one branch; the parser still tracks the
 * "current" branch from the most recent header block so a multi-branch
 * export (each branch its own section) would fall out the same way.
 */

export type CancellationRow = {
  docNo: string;
  /** ISO `YYYY-MM-DD`. */
  cancelDate: string;
  /** Full cancel timestamp with IST offset (`2026-08-31T12:44:00+05:30`), or
   * null if the report row had no time. */
  cancelAt: string | null;
  /** Normalized to a known label where possible, else the printed text. */
  cancelReason: string;
  refDocNo: string | null;
  regNo: string | null;
  ownerCode: string | null;
  ownerName: string | null;
  docCustomer: string | null;
  /** ISO `YYYY-MM-DD`, or null if unreadable. */
  issueDate: string | null;
  beforeTax: number;
  tax: number;
  afterTax: number;
  cancelledBy: string | null;
};

export type CancellationBranchBlock = {
  branch: string;
  /** `YYYY-MM`. */
  month: string;
  rows: CancellationRow[];
};

export type ParsedCancellationReport = {
  blocks: CancellationBranchBlock[];
  /** Printed grand totals, for a sanity line on the upload screen. Null if
   * the report didn't carry a totals row we could read. */
  printedTotals: { beforeTax: number; tax: number; afterTax: number } | null;
  /** Rows that couldn't be parsed cleanly (column mis-split, unreadable
   * date, before+tax≠after). The route rejects the upload if this is
   * non-empty rather than saving a partial month. */
  errors: string[];
  /** Non-fatal notes shown to the uploader — e.g. the report's date range
   * doesn't start on the 1st, so a month re-upload would drop earlier rows. */
  warnings: string[];
};

/** pdf-parse's `getTable()` shape, pared to what this parser reads. */
export type CancellationPage = { tables: string[][][] };

export const CANCELLATION_REASONS = [
  "Data Entry Mistake",
  "Cancelled for Warranty",
  "Wrong Tax Calculation",
  "Others - Dealer",
  "Others - Customer",
  "Customer Mind Change",
] as const;

const CANONICAL_REASONS: Record<string, string> = {
  dataentrymistake: "Data Entry Mistake",
  cancldforwty: "Cancelled for Warranty",
  cancelledforwarranty: "Cancelled for Warranty",
  wrongtaxcalculation: "Wrong Tax Calculation",
  "others-dealer": "Others - Dealer",
  "others-customer": "Others - Customer",
  customermindchange: "Customer Mind Change",
};

export function parseCancellationTables(
  pages: CancellationPage[],
  knownBranches: string[],
  /** Used when the header's branch token can't be recognised — a branch
   * upload knows its own branch even if the PDF header is garbled. */
  fallbackBranch?: string,
): ParsedCancellationReport {
  const branchSet = new Set(knownBranches.map((b) => b.toUpperCase()));
  const errors: string[] = [];
  const warnings: string[] = [];
  const blocksByKey = new Map<string, CancellationBranchBlock>();
  let printedTotals: ParsedCancellationReport["printedTotals"] = null;

  let currentBranch: string | null = fallbackBranch ? fallbackBranch.toUpperCase() : null;
  let currentMonth: string | null = null;
  let sawCancellationHeading = false;

  for (const page of pages ?? []) {
    for (const table of page.tables ?? []) {
      let columnIndex: Record<string, number> | null = null;

      for (const rawRow of table) {
        const row = rawRow.map((c) => clean(c));
        const joined = row.join(" ");

        if (/Cancellation\s+Report/i.test(joined)) sawCancellationHeading = true;

        // Header block — carries the branch and the report's date range.
        const range = detectRange(joined);
        if (range) {
          currentMonth = range.month;
          const headerBranch = detectBranch(joined, branchSet);
          if (headerBranch) currentBranch = headerBranch;
          else if (fallbackBranch) currentBranch = fallbackBranch.toUpperCase();
          if (range.fromDay > 1) {
            warnings.push(
              `The report covers ${range.from} to ${range.to}, not the whole of ${range.month} — ` +
                `re-uploading replaces the month, so cancellations before ${range.from} would be dropped.`,
            );
          }
          continue;
        }

        // Column-header row — establishes which cell is which.
        if (row.some((c) => /^SI\.?No\.?$/i.test(c))) {
          columnIndex = mapColumns(row);
          continue;
        }

        // Grand-total row — "965,259.66 174,571.18 1,139,830.84", no SI.No.
        if (!/^\d+$/.test(row[0] ?? "") && /Grand\s*Tot/i.test(joined)) {
          const nums = (joined.match(/[\d,]+\.\d{2}/g) ?? []).map(toNumber);
          if (nums.length >= 3) printedTotals = { beforeTax: nums[0], tax: nums[1], afterTax: nums[2] };
          continue;
        }

        // Data row — first cell is the SI.No.
        if (!/^\d+$/.test(row[0] ?? "")) continue;
        if (!columnIndex) {
          errors.push(`Row ${row[0]}: reached a data row before the column header — unexpected layout.`);
          continue;
        }

        const parsed = parseDataRow(row, columnIndex);
        if (typeof parsed === "string") {
          errors.push(`Row ${row[0]}: ${parsed}`);
          continue;
        }

        const branch = currentBranch;
        // A row's month comes from its own cancel date, not the header range —
        // robust to a report that spans a month boundary.
        const month = currentMonth ?? parsed.cancelDate.slice(0, 7);
        if (!branch) {
          errors.push(`Row ${row[0]} (${parsed.docNo}): couldn't tell which branch this report is for.`);
          continue;
        }

        const key = `${branch}|${month}`;
        let block = blocksByKey.get(key);
        if (!block) {
          block = { branch, month, rows: [] };
          blocksByKey.set(key, block);
        }
        block.rows.push(parsed);
      }
    }
  }

  const blocks = [...blocksByKey.values()];
  if (blocks.length === 0 && errors.length === 0) {
    errors.push(
      sawCancellationHeading
        ? "Recognised the Cancellation Report heading but couldn't read any cancelled-invoice rows."
        : "This doesn't look like a Tax Invoice Cancellation Report.",
    );
  }

  return { blocks, printedTotals, errors, warnings: [...new Set(warnings)] };
}

// --- row parsing --------------------------------------------------------

function parseDataRow(row: string[], col: Record<string, number>): CancellationRow | string {
  const cell = (name: string) => (col[name] !== undefined && col[name] !== -1 ? (row[col[name]] ?? "") : "");

  const docNo = cell("docno").replace(/\s+/g, "");
  if (!docNo) return "no DocNo.";

  const cancelCell = cell("cancel");
  const cancelDate = toIsoDate(firstDate(cancelCell));
  if (!cancelDate) return `unreadable Cancel Date "${cancelCell}".`;
  const cancelAt = toIsoDateTime(cancelCell);

  const beforeTax = toNumber(firstMoney(cell("before")));
  const tax = toNumber(firstMoney(cell("tax")));

  // "Tot Sales After Tax" sometimes swallows a non-wrapping "Cancel By" name
  // ("584,394.00 Rahul V G" with an empty Cancel By cell). Split it back out.
  const afterCell = cell("after");
  const afterMatch = afterCell.match(/^([\d,]+\.\d{2})\s*(.*)$/);
  const afterTax = toNumber(afterMatch ? afterMatch[1] : firstMoney(afterCell));
  let cancelledBy = cell("cancelby").replace(/\s+/g, " ").trim() || null;
  if (!cancelledBy && afterMatch && afterMatch[2].trim()) cancelledBy = afterMatch[2].trim();

  if (!Number.isFinite(beforeTax) || !Number.isFinite(tax) || !Number.isFinite(afterTax)) {
    return `unreadable amounts (before "${cell("before")}", tax "${cell("tax")}", after "${afterCell}").`;
  }
  if (Math.abs(beforeTax + tax - afterTax) > 0.05) {
    return `amounts don't reconcile — ${beforeTax} + ${tax} ≠ ${afterTax} (column mis-alignment).`;
  }

  const ownerRaw = cell("owner").replace(/\s+/g, " ").trim();
  const ownerSplit = ownerRaw.match(/^(\S+)\s+(.*)$/);

  return {
    docNo,
    cancelDate,
    cancelAt,
    cancelReason: normalizeReason(cell("reason")),
    refDocNo: cell("refdoc").replace(/\s+/g, "") || null,
    regNo: cell("regno").replace(/\s+/g, "") || null,
    ownerCode: ownerSplit ? ownerSplit[1] : ownerRaw || null,
    ownerName: ownerSplit ? ownerSplit[2] : null,
    docCustomer: cell("customer").replace(/\s+/g, " ").trim() || null,
    issueDate: toIsoDate(firstDate(cell("issue"))),
    beforeTax,
    tax,
    afterTax,
    cancelledBy,
  };
}

// --- column mapping ----------------------------------------------------

/** Maps this report's column-header row to the internal keys parseDataRow
 * reads. Header labels are matched loosely (whitespace/case-insensitive
 * substring) so a trailing-space or line-wrap quirk doesn't drop a column. */
function mapColumns(headerRow: string[]): Record<string, number> {
  const norm = headerRow.map((h) => h.replace(/\s+/g, " ").trim().toLowerCase());
  const find = (...needles: string[]) => norm.findIndex((h) => needles.some((n) => h.includes(n)));

  return {
    docno: find("docno", "doc no"),
    cancel: find("cancel date", "date/time"),
    issue: find("issue date"),
    refdoc: pickRefDoc(norm),
    owner: find("owner/code", "owner"),
    customer: find("doc.customer", "customer"),
    regno: find("regno", "reg no"),
    before: find("before tax"),
    tax: pickTax(norm),
    after: find("after tax"),
    cancelby: find("cancel by"),
    reason: find("cancel reason", "reason"),
  };
}

/** "refdoc.no" vs "refdoc.date" both contain "refdoc" — take the ".no" one. */
function pickRefDoc(norm: string[]): number {
  const exact = norm.findIndex((h) => h.includes("refdoc") && (h.includes("no") || h.includes("number")) && !h.includes("date"));
  return exact !== -1 ? exact : norm.findIndex((h) => h.includes("refdoc"));
}

/** Plain "tax" also matches "before tax" / "after tax" — take the bare one. */
function pickTax(norm: string[]): number {
  const bare = norm.findIndex((h) => h === "tax");
  return bare !== -1 ? bare : norm.findIndex((h) => h.includes("tax") && !h.includes("before") && !h.includes("after"));
}

// --- header detection -------------------------------------------------

function detectBranch(text: string, branchSet: Set<string>): string | null {
  // "<CODE> NIPPON TOYOTA" appears twice — once for the dealer group
  // (GR034), once for the branch. Take the token that's a known branch.
  const matches = [...text.matchAll(/([A-Z0-9]{3,8})\s+NIPPON\s+TOYOTA/gi)];
  for (const m of matches) {
    if (branchSet.has(m[1].toUpperCase())) return m[1].toUpperCase();
  }
  return null;
}

function detectRange(text: string): { month: string; from: string; to: string; fromDay: number } | null {
  // "01082026 31082026 All Cancellation Date" — From then To, both DDMMYYYY.
  const m = text.match(/\b(\d{2})(\d{2})(\d{4})\s+(\d{2})(\d{2})(\d{4})\b/);
  if (!m) return null;
  const [, fd, fm, fy, td, tm, ty] = m;
  if (Number(fm) < 1 || Number(fm) > 12) return null;
  return {
    month: `${fy}-${fm}`,
    from: `${fy}-${fm}-${fd}`,
    to: `${ty}-${tm}-${td}`,
    fromDay: Number(fd),
  };
}

// --- primitives -----------------------------------------------------

function clean(cell: string): string {
  return String(cell ?? "").replace(/\r/g, "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

function firstDate(s: string): string | null {
  const m = s.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
  return m ? m[0] : null;
}

function firstMoney(s: string): string {
  const m = s.match(/-?[\d,]+(?:\.\d{1,2})?/);
  return m ? m[0] : "";
}

function toNumber(s: string): number {
  return Number(String(s).replace(/,/g, "").trim());
}

/** `DD/MM/YYYY` (day-first, Indian) → ISO `YYYY-MM-DD`. Null if not a real date. */
function toIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const parts = raw.split("/").map(Number);
  if (parts.length !== 3) return null;
  const [d, mo, yRaw] = parts;
  const y = yRaw < 100 ? yRaw + 2000 : yRaw;
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** `DD/MM/YYYY HH:MM` → ISO with IST offset (`2026-08-31T12:44:00+05:30`).
 * Null if the date part is unreadable; time defaults to 00:00 when absent.
 * Tolerates the stray space getTable() leaves around the wrapped colon
 * ("12:\n44" → "12: 44"). */
function toIsoDateTime(raw: string): string | null {
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2})\s*:\s*(\d{2}))?/);
  if (!m) return null;
  const iso = toIsoDate(`${m[1]}/${m[2]}/${m[3]}`);
  if (!iso) return null;
  const hh = m[4] ? Number(m[4]) : 0;
  const mi = m[5] ? Number(m[5]) : 0;
  if (hh > 23 || mi > 59) return `${iso}T00:00:00+05:30`;
  return `${iso}T${String(hh).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00+05:30`;
}

function normalizeReason(raw: string): string {
  const key = raw.toLowerCase().replace(/[^a-z-]/g, "");
  return CANONICAL_REASONS[key] ?? raw.replace(/\s+/g, " ").trim();
}
