import * as XLSX from "xlsx";
import { BA_TOOL_COLUMNS, normalizeHeader, type BaToolKey } from "./columns";

export type BaToolBranchRow = Partial<Record<BaToolKey, number | string | null>> & {
  branch: string;
};

export type ParsedBaTool = {
  branches: BaToolBranchRow[];
  unmatchedColumns: string[];
  /** Every row exactly as read from the file, every column (not just the
   * ones the KPI formulas use), keyed by that row's own branch — this is
   * one company-wide file, so raw storage has to be split per branch the
   * same way the computed `branches` above already is (2026-09-01, at the
   * user's request). See raw-upload-rows/store.ts. */
  rawRows: { branch: string; data: Record<string, unknown> }[];
};

/** Matches numbers with thousands separators, e.g. "1,529" or "16,553.20" —
 * the BA Tool export formats larger figures this way, and plain Number()
 * silently rejects the comma (returns NaN), so it has to be stripped first. */
const THOUSANDS_SEPARATED = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;

function toNumberOrRaw(value: unknown): number | string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const str = String(value).trim();
  if (str.endsWith("%")) {
    const n = Number(str.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : str;
  }
  if (THOUSANDS_SEPARATED.test(str)) {
    const n = Number(str.replace(/,/g, ""));
    return Number.isFinite(n) ? n : str;
  }
  const n = Number(str);
  return Number.isFinite(n) ? n : str;
}

/**
 * Parses a BA Tool workbook (single sheet, single clean header row, one row
 * per branch) into per-branch values keyed by the internal column names in
 * columns.ts. Unmatched headers are reported, not silently dropped — the
 * file may have columns beyond what the confirmed KPI formulas use.
 */
export function parseBaToolWorkbook(buffer: Buffer): ParsedBaTool {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false, blankrows: true });

  if (rows.length === 0) return { branches: [], unmatchedColumns: [], rawRows: [] };

  const rawHeaderRow = (rows[0] ?? []).map((h) => String(h ?? "").trim());
  const headerRow = rawHeaderRow.map((h) => normalizeHeader(h));

  const columnIndexByKey = new Map<BaToolKey, number>();
  for (const [key, headerName] of Object.entries(BA_TOOL_COLUMNS) as [BaToolKey, string][]) {
    const idx = headerRow.findIndex((h) => h === headerName);
    if (idx !== -1) columnIndexByKey.set(key, idx);
  }

  const matchedIndexes = new Set(columnIndexByKey.values());
  const unmatchedColumns = headerRow.filter((h, i) => h && !matchedIndexes.has(i));

  const branches: BaToolBranchRow[] = [];
  const rawRows: { branch: string; data: Record<string, unknown> }[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const branchIdx = columnIndexByKey.get("branch");
    const branchValue = branchIdx !== undefined ? row[branchIdx] : null;
    if (!branchValue || String(branchValue).trim() === "") continue; // skip the blank/total row
    const branch = String(branchValue).trim();

    const entry: BaToolBranchRow = { branch };
    for (const [key, idx] of columnIndexByKey.entries()) {
      if (key === "branch") continue;
      entry[key] = toNumberOrRaw(row[idx]);
    }
    branches.push(entry);

    const rawData: Record<string, unknown> = {};
    rawHeaderRow.forEach((header, i) => {
      if (header) rawData[header] = row[i] ?? null;
    });
    rawRows.push({ branch, data: rawData });
  }

  return { branches, unmatchedColumns, rawRows };
}
