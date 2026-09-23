// TI01A's September Part Sale data has the same class of issue as IR01A's
// (see scripts/fix-ir01a-sep-part-sale-real-dates.mts): rows filed under an
// upload-date label that doesn't match their own SaleDate. Checked first
// (before this file existed) by decoding every existing row's real SaleDate
// straight from raw_upload_rows — the current MTD total already matched
// that decoded total exactly (₹3,18,741.01), so unlike IR01A nothing
// appeared *missing* from what's already on file — labels "6", "9", and
// "13 Sep" held zero rows whose real SaleDate was actually that day, while
// real business for 1, 4, 8, 11, 18, 22 Sep sat mislabeled inside other
// dates' snapshots.
//
// The user then supplied "Part sale till 22nd sep.xlsx" (9,748 rows) — a
// fresh full-month export whose SaleDate is the raw-serial encoding (not a
// plain date string like IR01A's file), same calibration confirmed
// elsewhere: 46212 = 7 Sep 2026, ~31 raw units/real day (see
// memory/project_ti01c_part_sale_saledate_encoding). Comparing its rows
// against everything on file (by BillNo+PartNo+NetAmnt+Sale Qty) found 528
// rows genuinely missing — 526 of them decode to real SaleDate 9 Sep
// (raw 46274), confirming that's a real gap, not just mislabeling; 19 of
// the missing rows are A-type (External Sales), summing to ₹30,096.80.
//
// Re-buckets TI01A's entire September part_sale data by real SaleDate
// straight from this file, same approach as the IR01A script: replaces
// (not merges with) whatever's currently stored under each real date,
// since the file's per-day content already matches existing data almost
// exactly (9,221 of 9,748 rows already present).
//
//   npx tsx scripts/fix-ti01a-sep-part-sale-real-dates.mts [--commit]
import fs from "fs";
import * as XLSX from "xlsx";
import "./load-env.mjs";
import { partSaleCountsFromRows, alwaysEligible } from "../src/lib/part-sale/parse";
import { savePartSaleSnapshot } from "../src/lib/part-sale/store";
import { saveRawUploadRows } from "../src/lib/raw-upload-rows/store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01A";
const FILE_PATH = "C:\\Users\\Nippon\\Downloads\\Part sale till 22nd sep.xlsx";
const SOURCE_FILE_NAME = "Part sale till 22nd sep.xlsx";

/** Same calibration as IR01A/TI01C: raw SaleDate 46212 = 2026-09-07,
 * ~31 raw units per real calendar day. A plain DD/MM/YYYY string (seen on
 * some IR01A files) is handled too, for safety, though this file uses the
 * numeric serial throughout. */
function decodeSaleDate(raw: unknown): string {
  if (raw == null || raw === "") throw new Error("empty SaleDate");
  if (typeof raw === "string") {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const serial = Number(raw);
  if (!Number.isFinite(serial)) throw new Error(`unparseable SaleDate: ${raw}`);
  const day = 7 + Math.round((serial - 46212) / 31);
  const d = new Date(Date.UTC(2026, 8, day)); // month 8 = September
  return d.toISOString().slice(0, 10);
}

const buffer = fs.readFileSync(FILE_PATH);
const workbook = XLSX.read(buffer, { type: "buffer" });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
const dataRows = allRows.filter((r) => r["BillNo"]);

const byDate = new Map<string, Record<string, unknown>[]>();
for (const row of dataRows) {
  const iso = decodeSaleDate(row["SaleDate"]);
  const list = byDate.get(iso) ?? [];
  list.push(row);
  byDate.set(iso, list);
}

const dates = [...byDate.keys()].sort();
console.log(`Parsed ${dataRows.length} rows across ${dates.length} real calendar dates: ${dates[0]} .. ${dates[dates.length - 1]}\n`);

let totalBefore = 0;
let totalAfter = 0;

for (const date of dates) {
  const rows = byDate.get(date)!;
  const counts = partSaleCountsFromRows(rows, alwaysEligible);

  const { rows: existing } = await pool.query<{ external_sales: string; rows: string }>(
    `select coalesce((select external_sales::text from part_sale_snapshots where branch=$1 and date=$2), 'none') as external_sales,
            (select count(*)::text from raw_upload_rows where report_type='part_sale' and branch=$1 and date=$2) as rows`,
    [BRANCH, date]
  );
  const before = existing[0];
  const beforeExternal = before.external_sales === "none" ? 0 : Number(before.external_sales);
  totalBefore += beforeExternal;
  totalAfter += counts.externalSales;

  const changed =
    before.external_sales === "none" ||
    Number(before.external_sales).toFixed(2) !== counts.externalSales.toFixed(2) ||
    before.rows !== String(rows.length);
  console.log(
    `${date}  rows ${before.rows} -> ${rows.length}  externalSales ${beforeExternal.toFixed(2)} -> ${counts.externalSales.toFixed(2)}${changed ? "  *" : ""}`
  );

  if (COMMIT) {
    await saveRawUploadRows({
      reportType: "part_sale",
      date,
      uploadedAt: new Date().toISOString(),
      sourceFileName: SOURCE_FILE_NAME,
      rows: rows.map((data) => ({ branch: BRANCH, data })),
    });
    await savePartSaleSnapshot({
      date,
      branch: BRANCH,
      uploadedAt: new Date().toISOString(),
      sourceFileName: SOURCE_FILE_NAME,
      counts,
    });
  }
}

console.log(`\nSeptember External Sales total (only dates covered by this file): ${totalBefore.toFixed(2)} -> ${totalAfter.toFixed(2)}`);
console.log(COMMIT ? "\nCommitted." : "\nDry run — re-run with --commit to write.");
await pool.end();
