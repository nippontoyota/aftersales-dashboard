// TI01A's "Service Info Report - GS" slot for 2026-09-23 holds the wrong
// file: 36 rows, every one of them a Body & Paint job (BODREP99, SIMPLP99,
// panel painting, bumper/door replacement, windshield glass...), identical
// to the file that's correctly sitting in the BP slot for the same date.
// Someone backfilling via Upload Sheet on 2026-09-24 uploaded the BP file
// into both slots, so the GS snapshot computed 0 for every metric (no GS
// job codes matched) while the real GS data for that day was never
// uploaded at all.
//
// The user supplied "Service_Info_Report-TI01A-1791003466279_1.csv" — a
// full-month export covering all of September — confirmed earlier (Invoice
// Date sums to exactly 4,415 rows across 09/01-09/30) to be pure GS data
// (zero BP job codes anywhere in it) and to reconcile exactly against TI01A's
// other GS snapshots once the Saturday-merge pattern is accounted for. Its
// 143 rows for Invoice Date = 09/23/2026 are the real GS data for that day:
// WB=4, WA=6, BrakeSkimming=3 ROs, EvaporatorCleaning=4, vasRevenue=~50,133.40
// (computed independently before this script existed; re-verified here
// through the actual production parser, not a reimplementation).
//
// Fix: re-extract those 143 rows as a standalone file, run them through the
// real parseServiceInfoWorkbook (same code path /api/upload/service-info
// uses), then overwrite the 09-23 GS snapshot + replace the 36 wrong raw
// rows with the correct 143 — saveRawUploadRows already deletes whatever's
// on file for (service_info, 2026-09-23, TI01A) before inserting, so no
// separate dedup step is needed. The BP slot is untouched — it's correct.
//
//   npx tsx scripts/fix-ti01a-sep23-service-info-gs.mts [--commit]
import fs from "fs";
import "./load-env.mjs";
import { listAccessoriesStaffNamesForBranch } from "../src/lib/accessories-staff-store";
import { parseServiceInfoWorkbook } from "../src/lib/service-info/parse";
import { loadServiceInfoSnapshot, saveServiceInfoSnapshot } from "../src/lib/service-info/store";
import { saveRawUploadRows } from "../src/lib/raw-upload-rows/store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01A";
const DATE = "2026-09-23";
const SOURCE_PATH = "C:\\Users\\Nippon\\Downloads\\Service_Info_Report-TI01A-1791003466279_1.csv";
const SOURCE_FILE_NAME = "Service_Info_Report-TI01A-1791003466279_1.csv (Sep-23 split, HQ correction)";

// Minimal CSV parser — handles quoted fields, embedded commas/newlines,
// doubled-quote escaping (same shape as every other field in this export,
// e.g. multi-line "QC Remarks").
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ",") {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      if (c === "\r") {
        i++;
        continue;
      }
      if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

const text = fs.readFileSync(SOURCE_PATH, "utf8").replace(/^\uFEFF/, "");
const allRows = parseCSV(text);
const header = allRows[0];
const invoiceDateIdx = header.indexOf("Invoice Date");
if (invoiceDateIdx === -1) throw new Error("Invoice Date column not found");

const dataRows = allRows.slice(1).filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
const sep23Rows = dataRows.filter((r) => r[invoiceDateIdx] === "09/23/2026");
console.log(`Found ${sep23Rows.length} rows with Invoice Date = 09/23/2026 (of ${dataRows.length} total in the file).`);

// Rebuild a standalone CSV buffer for just these rows, same shape as the
// original export (every field quoted), so it goes through the real parser
// exactly as if it had been uploaded on its own.
const csvLines = [header, ...sep23Rows].map((r) => r.map(csvEscape).join(","));
const buffer = Buffer.from(csvLines.join("\r\n") + "\r\n", "utf8");

const staffNames = await listAccessoriesStaffNamesForBranch(BRANCH);
const { counts, rawRows } = parseServiceInfoWorkbook(buffer, BRANCH, staffNames);
console.log("Parsed via the real parseServiceInfoWorkbook:", counts, "rows:", rawRows.length);

const existingSnapshot = await loadServiceInfoSnapshot(DATE, BRANCH);
console.log("Current (wrong) snapshot on file:", existingSnapshot?.counts, existingSnapshot?.sourceFileName);

const { rows: existingRawCount } = await pool.query<{ count: string }>(
  `select count(*)::text as count from raw_upload_rows where report_type='service_info' and branch=$1 and date=$2`,
  [BRANCH, DATE]
);
console.log(`Current raw rows on file for (service_info, ${BRANCH}, ${DATE}):`, existingRawCount[0].count);

if (!COMMIT) {
  console.log("\nDry run — re-run with --commit to write.");
  process.exit(0);
}

const uploadedAt = new Date().toISOString();
const dbClient = await pool.connect();
try {
  await dbClient.query("begin");
  await saveServiceInfoSnapshot({ date: DATE, branch: BRANCH, uploadedAt, sourceFileName: SOURCE_FILE_NAME, counts }, dbClient);
  await saveRawUploadRows(
    {
      reportType: "service_info",
      date: DATE,
      uploadedAt,
      sourceFileName: SOURCE_FILE_NAME,
      rows: rawRows.map((data) => ({ branch: BRANCH, data })),
    },
    dbClient
  );
  await dbClient.query("commit");
  console.log("\nCommitted.");
} catch (err) {
  await dbClient.query("rollback");
  throw err;
} finally {
  dbClient.release();
}

const after = await loadServiceInfoSnapshot(DATE, BRANCH);
console.log("New snapshot:", after?.counts, after?.sourceFileName);
await pool.end();
