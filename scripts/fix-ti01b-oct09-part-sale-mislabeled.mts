// TI01B 2026-10-09: the upload stored under this date is NOT 9 Oct's real
// data at all — its 62 rows' own SaleDate is 10/10/26, and all 62 are a
// partial subset of 10 Oct's real 148 rows (the full 148, plus 11 Oct's 26,
// already sit correctly under the "2026-10-11" bucket — 148+26=174, matching
// exactly). So 9 Oct's real Part Sale data was never uploaded under any date,
// while what *is* filed under "2026-10-09" double-counts a chunk of 10 Oct
// (1 Engine Flush, 3 Synthetic Oil rows, 7 Brake Cleaning Spray rows) on top
// of the already-correct "2026-10-11" copy.
//
// Traced from "Parts Nada.xls" (the branch's own manual Part Sale Report
// export) sent 2026-10-23: External Sales MTD read 67,229.3 on the dashboard
// vs 69,557.3 manually — the ₹2,328 gap is exactly 9 Oct's 3 real external
// sale bills (AT26-00500/501/502), confirmed absent from our data under any
// date.
//
// Fix: replace (not append) whatever's stored for TI01B/2026-10-09 with the
// file's real 9-Oct rows — saveRawUploadRows already deletes-then-inserts
// for the exact (reportType, date, branch) key, which both removes the wrong
// duplicate rows and files the real data in one step.
//
//   npx tsx scripts/fix-ti01b-oct09-part-sale-mislabeled.mts [--commit]
import fs from "fs";
import * as XLSX from "xlsx";
import "./load-env.mjs";
import { partSaleCountsFromRows, alwaysEligible } from "../src/lib/part-sale/parse";
import { savePartSaleSnapshot, loadPartSaleSnapshot } from "../src/lib/part-sale/store";
import { saveRawUploadRows, loadRawUploadRows } from "../src/lib/raw-upload-rows/store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01B";
const DATE = "2026-10-09";
const FILE_PATH = "C:\\Users\\Nippon\\Downloads\\Parts Nada.xls";
const SOURCE_FILE_NAME = "Parts Nada.xls";

function parseDmy(value: unknown): string | null {
  const parts = String(value ?? "").split("/");
  if (parts.length !== 3) return null;
  let [d, m, y] = parts.map((p) => parseInt(p, 10));
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
  if (y < 100) y += 2000;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const buffer = fs.readFileSync(FILE_PATH);
const workbook = XLSX.read(buffer, { type: "buffer" });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const fileRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });

const realOct9Rows = fileRows.filter((r) => parseDmy(r["SaleDate"]) === DATE);
console.log(`Real ${DATE} rows found in file: ${realOct9Rows.length}`);

const existingRows = (await loadRawUploadRows("part_sale", DATE, BRANCH)) as Record<string, unknown>[];
console.log(`Existing (mislabeled) rows on file for ${BRANCH} ${DATE}: ${existingRows.length}`);

const newCounts = partSaleCountsFromRows(realOct9Rows, alwaysEligible);
const oldCounts = partSaleCountsFromRows(existingRows, alwaysEligible);

const before = await loadPartSaleSnapshot(DATE, BRANCH);
console.log("\nStored snapshot counts (wrong, mislabeled Oct-10 subset):", before?.counts);
console.log("Recomputed from existing raw rows (sanity check, should match stored):", oldCounts);
console.log("Counts from the real 9-Oct rows (what will replace it):", newCounts);

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
  rows: realOct9Rows.map((data) => ({ branch: BRANCH, data })),
});
await savePartSaleSnapshot({
  date: DATE,
  branch: BRANCH,
  uploadedAt: new Date().toISOString(),
  sourceFileName: SOURCE_FILE_NAME,
  counts: newCounts,
});
console.log("\nCommitted.");
await pool.end();
