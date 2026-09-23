// MV01A: the user supplied "MV01A- SALE REPORT - SEPT 2026.xls" (112 rows)
// expecting exactly ₹2,876 missing. Comparing every row (by
// BillNo+PartNo+NetAmnt+Sale Qty) against what's already on file found
// exactly 2 missing A-type rows summing to ₹2,876 (AK26-00321 ₹2,539,
// AK26-00322 ₹337) — confirms the user's figure exactly.
//
// Unlike IR01A/TI01A, this isn't a month-wide mislabeling problem: the
// other 110 rows in the file already match existing data exactly, and the
// 2 missing rows' raw SaleDate (46273) decodes to the same real day (9 Sep)
// as the 582 rows already correctly filed under the "2026-09-09" snapshot
// (SaleDate 46274 — 1 raw unit apart, same calibration as IR01A/TI01C:
// 46212 = 7 Sep, ~31 units/day). So this is a straight append to the
// already-correct 9 Sep bucket, not a re-bucket of the whole month.
//
// saveRawUploadRows replaces (not merges) whatever's stored for a given
// (reportType, date, branch), so this loads the 9 Sep raw rows already on
// file, adds the 2 new ones, and writes the combined set back — an append,
// achieved safely through the replace API.
//
//   npx tsx scripts/fix-mv01a-sep09-part-sale-missing.mts [--commit]
import fs from "fs";
import * as XLSX from "xlsx";
import "./load-env.mjs";
import { partSaleCountsFromRows, alwaysEligible } from "../src/lib/part-sale/parse";
import { savePartSaleSnapshot, loadPartSaleSnapshot } from "../src/lib/part-sale/store";
import { saveRawUploadRows, loadRawUploadRows } from "../src/lib/raw-upload-rows/store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "MV01A";
const DATE = "2026-09-09";
const FILE_PATH = "C:\\Users\\Nippon\\Downloads\\MV01A- SALE REPORT - SEPT 2026.xls";
const SOURCE_FILE_NAME = "MV01A- SALE REPORT - SEPT 2026.xls";

const MISSING_BILLS = new Set(["AK26-00321", "AK26-00322"]);

const buffer = fs.readFileSync(FILE_PATH);
const workbook = XLSX.read(buffer, { type: "buffer" });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const fileRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

const newRows = fileRows.filter((r) => MISSING_BILLS.has(String(r["BillNo"])));
console.log(`New rows found in file: ${newRows.length} (expected ${MISSING_BILLS.size})`);
for (const r of newRows) console.log(`  ${r["BillNo"]}  ${r["PartNo"]}  NetAmnt=${r["NetAmnt"]}  SaleDate=${r["SaleDate"]}`);

const existingRows = (await loadRawUploadRows("part_sale", DATE, BRANCH)) as Record<string, unknown>[];
console.log(`\nExisting raw rows on file for ${BRANCH} ${DATE}: ${existingRows.length}`);

const combined = [...existingRows, ...newRows];
const counts = partSaleCountsFromRows(combined, alwaysEligible);

const before = await loadPartSaleSnapshot(DATE, BRANCH);
console.log(`\nExternal Sales ${DATE}: ${before?.counts.externalSales.toFixed(2) ?? "none"} -> ${counts.externalSales.toFixed(2)}`);
console.log(`Row count: ${existingRows.length} -> ${combined.length}`);

if (!COMMIT) {
  console.log("\nDry run — re-run with --commit to write.");
  await pool.end();
  process.exit(0);
}

await saveRawUploadRows({
  reportType: "part_sale",
  date: DATE,
  uploadedAt: new Date().toISOString(),
  sourceFileName: SOURCE_FILE_NAME,
  rows: combined.map((data) => ({ branch: BRANCH, data })),
});
await savePartSaleSnapshot({
  date: DATE,
  branch: BRANCH,
  uploadedAt: new Date().toISOString(),
  sourceFileName: SOURCE_FILE_NAME,
  counts,
});
console.log("\nCommitted.");
await pool.end();
