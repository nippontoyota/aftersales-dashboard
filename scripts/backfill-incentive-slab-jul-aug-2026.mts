// Adds July and August 2026 incentive slab targets from "inc slab q3 (1).xlsx"
// (REVISED SLAB SOUTH/CENTRAL/NORTH - Q3). September is already loaded in
// incentive_slab_targets (2026-09, from "Q3 Slab wise target.xlsx") and is
// deliberately left untouched here — the two sheets disagree on slab3/slab4
// for 5 North branches, and the user chose to keep what's already loaded for
// September rather than overwrite it from this revised file.
//
// This file has one sheet with three month-blocks side by side (Jul/Aug/Sep,
// separated by blank columns), each block [branch, slab4, slab3, slab2,
// slab1], keyed by friendly branch name rather than branch code. The mapping
// below was validated against the existing September row: 12 of 17 branches
// match it exactly on all four slabs.
import "./load-env.mjs";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { pool } from "../src/lib/db";
import { saveIncentiveSlabTargets } from "../src/lib/incentive-slabs/store";
import type { ParsedIncentiveSlabRow } from "../src/lib/incentive-slabs/parse";

const SOURCE_PATH = "C:/Users/Nippon/Downloads/inc slab q3 (1).xlsx";
const SOURCE_FILE_NAME = "inc slab q3 (1).xlsx";
const UPLOADED_BY = "admin";

const NAME_TO_BRANCH: Record<string, string> = {
  Tvm: "TR01A",
  Ench: "TR01C",
  Veli: "TR01B",
  "KLm 3s": "KL01A",
  "KLm bp": "KL01B",
  ptmta: "PH01A",
  Nettur: "CO01A",
  Towers: "CO01B",
  Mvpa: "MV01A",
  Kymklm: "KY01A",
  tvla: "TL01A",
  ktm: "KT01A",
  pala: "KT01B",
  TCR: "TI01A",
  Ijkda: "IR01A",
  Nad: "TI01B",
  Chvkd: "TI01C",
};

function toAmount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

// colStart is the "branch" column of a [branch, slab4, slab3, slab2, slab1] block.
function extractMonth(rows: unknown[][], colStart: number): ParsedIncentiveSlabRow[] {
  const parsed: ParsedIncentiveSlabRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = String(row[colStart] ?? "").trim();
    const branch = NAME_TO_BRANCH[name];
    if (!branch || seen.has(branch)) continue;
    const slab4 = toAmount(row[colStart + 1]);
    const slab3 = toAmount(row[colStart + 2]);
    const slab2 = toAmount(row[colStart + 3]);
    const slab1 = toAmount(row[colStart + 4]);
    if (slab1 === null || slab2 === null || slab3 === null || slab4 === null) continue;
    seen.add(branch);
    parsed.push({ branch, slab1, slab2, slab3, slab4 });
  }
  return parsed;
}

const buffer = readFileSync(SOURCE_PATH);
const workbook = XLSX.read(buffer, { type: "buffer" });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

const july = extractMonth(rows, 0);
const august = extractMonth(rows, 6);

if (july.length !== 17) throw new Error(`Expected 17 July branches, got ${july.length}`);
if (august.length !== 17) throw new Error(`Expected 17 August branches, got ${august.length}`);

console.log("July 2026:", july.length, "branches");
console.log("August 2026:", august.length, "branches");

await saveIncentiveSlabTargets("2026-07", july, UPLOADED_BY, SOURCE_FILE_NAME);
await saveIncentiveSlabTargets("2026-08", august, UPLOADED_BY, SOURCE_FILE_NAME);

console.log("Done.");
await pool.end();
