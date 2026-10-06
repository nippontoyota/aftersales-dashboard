// CO01B's "Cost and Sales Report - BP" slot for 2026-09-02 held a
// byte-for-byte duplicate of that day's GS file (same filename
// "SSRV089_CostAndSalesReport-1788409546260_1.csv", same 201 rows, all
// GSJ-prefixed) — not a two-file swap like the already-fixed 2 Sep Service
// Info and 10 Sep SSRV089 incidents (see docs/data-reconciliation.md), just
// the same file landing in both slots. The real BP file for that date was
// never uploaded, so ssrv089_bp_grey_snapshots has no row at all for
// (CO01B, 2026-09-02) — whatever Grey-brand revenue CO01B had that day was
// uncounted. GS slot is untouched by this script; it was always correct.
//
// The user supplied the real file: "SSRV089_CostAndSalesReport-CO01B BP
// 2ND.csv" — 19 rows, all BPJ26-prefixed job orders, Branch Code CO01B
// throughout, Invoice Doc Date 02/09/2026 (plus a few late-closing jobs from
// 28/29/31 Aug invoiced into September) — confirmed as the genuine BP
// Cost & Sales export for this date/branch.
//
// Fix: run it through the real parseSsrv089BpGreyTotals (same code path
// ssrv089-bp/route.ts uses), replace the wrong file in raw_report_uploads
// (upserts on (date, branch, report_type), no separate delete needed) and
// upsert the real Grey totals into ssrv089_bp_grey_snapshots.
//
//   npx tsx scripts/fix-co01b-sep02-ssrv089-bp.mts [--commit]
import fs from "fs";
import * as XLSX from "xlsx";
import "./load-env.mjs";
import { parseSsrv089BpGreyTotals } from "../src/lib/ssrv089-bp/parse";
import { saveSsrv089BpGreySnapshot } from "../src/lib/ssrv089-bp/store";
import { loadRawReportUpload, saveRawReportUpload } from "../src/lib/raw-report-uploads/store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "CO01B";
const DATE = "2026-09-02";
const SOURCE_PATH = "C:\\Users\\Nippon\\Downloads\\SSRV089_CostAndSalesReport-CO01B BP 2ND.csv";
const SOURCE_FILE_NAME = "SSRV089_CostAndSalesReport-CO01B BP 2ND.csv";

const buffer = fs.readFileSync(SOURCE_PATH);
const parsed = parseSsrv089BpGreyTotals(buffer);
console.log("Parsed via the real parseSsrv089BpGreyTotals:", parsed);

// Sanity check — every row should be BPJ-prefixed, none GSJ (the opposite of
// what's currently wrongly on file).
const checkWb = XLSX.read(buffer, { type: "buffer" });
const checkSheet = checkWb.Sheets[checkWb.SheetNames[0]];
const checkRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(checkSheet, { defval: "", raw: false });
const bpjCount = checkRows.filter((r: Record<string, unknown>) => String(r["JobOrder No"] ?? "").startsWith("BPJ")).length;
const gsjCount = checkRows.filter((r: Record<string, unknown>) => String(r["JobOrder No"] ?? "").startsWith("GSJ")).length;
const branchCount = checkRows.filter((r: Record<string, unknown>) => String(r["Branch Code"] ?? "").trim() === BRANCH).length;
console.log(`Rows: ${checkRows.length}  BPJ-prefixed: ${bpjCount}  GSJ-prefixed: ${gsjCount}  Branch Code=${BRANCH}: ${branchCount}`);
if (gsjCount > 0) {
  console.error("ABORT: file contains GSJ-prefixed rows — this doesn't look like a pure BP file.");
  process.exit(1);
}
if (branchCount !== checkRows.length) {
  console.error(`ABORT: not every row's Branch Code is ${BRANCH}.`);
  process.exit(1);
}

const existing = await loadRawReportUpload(DATE, BRANCH, "ssrv089_bp");
console.log("Current (wrong) file on file:", existing);

const { rows: existingGrey } = await pool.query(`select * from ssrv089_bp_grey_snapshots where branch=$1 and date=$2`, [BRANCH, DATE]);
console.log("Current Grey snapshot on file:", existingGrey);

if (!COMMIT) {
  console.log("\nDry run — re-run with --commit to write.");
  process.exit(0);
}

const uploadedAt = new Date().toISOString();
await saveRawReportUpload({ date: DATE, branch: BRANCH, reportType: "ssrv089_bp", uploadedAt, sourceFileName: SOURCE_FILE_NAME, fileData: buffer });
await saveSsrv089BpGreySnapshot({ date: DATE, branch: BRANCH, uploadedAt, sourceFileName: SOURCE_FILE_NAME, totals: parsed.totals });
console.log("\nCommitted.");

const after = await loadRawReportUpload(DATE, BRANCH, "ssrv089_bp");
const { rows: afterGrey } = await pool.query(`select * from ssrv089_bp_grey_snapshots where branch=$1 and date=$2`, [BRANCH, DATE]);
console.log("New file on file:", after);
console.log("New Grey snapshot:", afterGrey);
await pool.end();
