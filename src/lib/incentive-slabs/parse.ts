import * as XLSX from "xlsx";
import { REGIONS, type RegionName } from "../regions";

/**
 * Incentive Slab target workbook (e.g. "Q3 Slab wise target.xlsx") — one
 * sheet, three stacked regional blocks (Central/South/North order doesn't
 * matter here, we key off branch code not row position), each block a
 * header row ("26D-slab 4" / "26D-slab 3" / "26D-slab 2" / "26D-slab 1" in
 * that left-to-right order) followed by one row per branch, then a TOTAL
 * row and a % row we ignore. Confirmed against the real file 2026-09-18:
 * columns are [branch, slab4, slab3, slab2, slab1, ...].
 *
 * Deliberately keyed off recognizing a branch code in column 0 rather than
 * fixed row offsets — robust to the header/total/%/blank rows shifting
 * around, which they did between blocks in the real file.
 */
const ALL_BRANCHES = new Set<string>((Object.keys(REGIONS) as RegionName[]).flatMap((r) => REGIONS[r] as readonly string[]));

export type ParsedIncentiveSlabRow = { branch: string; slab1: number; slab2: number; slab3: number; slab4: number };

function toAmount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export function parseIncentiveSlabWorkbook(buffer: Buffer): ParsedIncentiveSlabRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  const parsed: ParsedIncentiveSlabRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const branch = String(row[0] ?? "").trim();
    if (!ALL_BRANCHES.has(branch) || seen.has(branch)) continue;
    const slab4 = toAmount(row[1]);
    const slab3 = toAmount(row[2]);
    const slab2 = toAmount(row[3]);
    const slab1 = toAmount(row[4]);
    if (slab1 === null || slab2 === null || slab3 === null || slab4 === null) continue;
    seen.add(branch);
    parsed.push({ branch, slab1, slab2, slab3, slab4 });
  }
  return parsed;
}
