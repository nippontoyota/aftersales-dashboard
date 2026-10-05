// TR01A's "Cost and Sales Report - BP" slot for 2026-09-15 held a Part Sale
// Report ("Copy of 5. PartSaleReport-15.09.26.xls") — a completely different
// report type, uploaded 2026-09-16, predating the 2026-10-01 structural
// check that would now reject this outright. The real Cost & Sales BP file
// for that date was never uploaded; ssrv089_bp_grey_snapshots has no row at
// all for (TR01A, 2026-09-15).
//
// The user supplied the real file: "SSRV089_CostAndSalesReport-TR01A BP
// 15TH.csv" — 6 rows, all BPJ26-prefixed job orders, Branch Code TR01A
// throughout, Invoice Doc Date 15/09/2026 on every row — confirmed as the
// genuine BP Cost & Sales export for this date/branch.
//
// Fix: same remedy as CO01B's 2 Sep equivalent (scripts/fix-co01b-sep02-
// ssrv089-bp.mts) — parse via the real parseSsrv089BpGreyTotals, replace the
// wrong file in raw_report_uploads, upsert the real Grey totals.
//
//   npx tsx scripts/fix-tr01a-sep15-ssrv089-bp.mts [--commit]
import fs from "fs";
import * as XLSX from "xlsx";
import "./load-env.mjs";
import { parseSsrv089BpGreyTotals } from "../src/lib/ssrv089-bp/parse";
import { saveSsrv089BpGreySnapshot } from "../src/lib/ssrv089-bp/store";
import { loadRawReportUpload, saveRawReportUpload } from "../src/lib/raw-report-uploads/store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TR01A";
const DATE = "2026-09-15";
const SOURCE_PATH = "C:\\Users\\Nippon\\Downloads\\SSRV089_CostAndSalesReport-TR01A BP 15TH.csv";
const SOURCE_FILE_NAME = "SSRV089_CostAndSalesReport-TR01A BP 15TH.csv";

const buffer = fs.readFileSync(SOURCE_PATH);
const parsed = parseSsrv089BpGreyTotals(buffer);
console.log("Parsed via the real parseSsrv089BpGreyTotals:", parsed);

const checkWb = XLSX.read(buffer, { type: "buffer" });
const checkSheet = checkWb.Sheets[checkWb.SheetNames[0]];
const checkRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(checkSheet, { defval: "", raw: false });
const bpjCount = checkRows.filter((r) => String(r["JobOrder No"] ?? "").startsWith("BPJ")).length;
const gsjCount = checkRows.filter((r) => String(r["JobOrder No"] ?? "").startsWith("GSJ")).length;
const branchCount = checkRows.filter((r) => String(r["Branch Code"] ?? "").trim() === BRANCH).length;
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
