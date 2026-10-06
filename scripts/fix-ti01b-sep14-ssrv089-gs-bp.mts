// TI01B's entire "Cost and Sales Report" for 2026-09-14 was broken on both
// sides: the GS slot had no snapshot at all (never uploaded), and the BP
// slot held an unreadable 436-byte .zip ("SSRV089_CostAndSalesReport-
// 1789455650207.zip", uploaded 2026-09-15 — predates the 2026-10-01
// structural check that would now reject an unparseable file outright).
//
// The user supplied both real files:
// - GS: "SSRV089_CostAndSalesReport-TI01B GS 14TH.csv" — 64 rows, every
//   JobOrder No GSJ26-prefixed, every Branch Code TI01B, Invoice Doc Date
//   14/09/2026 on every row (OpenJobDate spans 07–14 Sep, normal — jobs
//   opened earlier, closed/invoiced on the 14th).
// - BP: "SSRV089_CostAndSalesReport-TI01B BP 14TH.csv" — header only, zero
//   data rows. A genuinely quiet Body & Paint day for TI01B, not a parse
//   failure — same "correct shape, no rows" case ssrv089-bp/parse.ts's
//   isEmpty flag exists for (confirmed via the real parser below, not
//   assumed).
//
// Fix: GS goes through the real parseSsrv089Workbook + saveSsrv089Snapshot +
// saveRawUploadRows (same path ssrv089-general/route.ts uses, including the
// post-upload cancellation-adjustment recompute). BP goes through the same
// parseSsrv089BpGreyTotals + saveRawReportUpload + saveSsrv089BpGreySnapshot
// pattern as the CO01B/TR01A fixes.
//
//   npx tsx scripts/fix-ti01b-sep14-ssrv089-gs-bp.mts [--commit]
import fs from "fs";
import * as XLSX from "xlsx";
import "./load-env.mjs";
import { listAccessoriesStaffNamesForBranch } from "../src/lib/accessories-staff-store";
import { parseSsrv089Workbook } from "../src/lib/ssrv089/parse";
import { loadSsrv089Snapshot, saveSsrv089Snapshot } from "../src/lib/ssrv089/store";
import { parseSsrv089BpGreyTotals } from "../src/lib/ssrv089-bp/parse";
import { saveSsrv089BpGreySnapshot } from "../src/lib/ssrv089-bp/store";
import { loadRawReportUpload, saveRawReportUpload } from "../src/lib/raw-report-uploads/store";
import { saveRawUploadRows } from "../src/lib/raw-upload-rows/store";
import { recomputeAfterSsrv089Upload } from "../src/lib/cancellation/adjustment-recompute";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01B";
const DATE = "2026-09-14";
const GS_PATH = "C:\\Users\\Nippon\\Downloads\\SSRV089_CostAndSalesReport-TI01B GS 14TH.csv";
const GS_FILE_NAME = "SSRV089_CostAndSalesReport-TI01B GS 14TH.csv";
const BP_PATH = "C:\\Users\\Nippon\\Downloads\\SSRV089_CostAndSalesReport-TI01B BP 14TH.csv";
const BP_FILE_NAME = "SSRV089_CostAndSalesReport-TI01B BP 14TH.csv";

// --- GS ---
const gsBuffer = fs.readFileSync(GS_PATH);
const staffNames = await listAccessoriesStaffNamesForBranch(BRANCH);
const { totals, rawRows } = parseSsrv089Workbook(gsBuffer, staffNames);
console.log("GS parsed via the real parseSsrv089Workbook:", totals, "rows:", rawRows.length);

const gsjCount = rawRows.filter((r) => String(r["JobOrder No"] ?? "").startsWith("GSJ")).length;
const branchCount = rawRows.filter((r) => String(r["Branch Code"] ?? "").trim() === BRANCH).length;
console.log(`GS rows: ${rawRows.length}  GSJ-prefixed: ${gsjCount}  Branch Code=${BRANCH}: ${branchCount}`);
if (gsjCount !== rawRows.length || branchCount !== rawRows.length) {
  console.error("ABORT: GS file doesn't look like a pure, correctly-branched GS file.");
  process.exit(1);
}

const existingGsSnapshot = await loadSsrv089Snapshot(DATE, BRANCH, "general");
console.log("Current GS snapshot on file (should be none):", existingGsSnapshot);

// --- BP ---
const bpBuffer = fs.readFileSync(BP_PATH);
const bpParsed = parseSsrv089BpGreyTotals(bpBuffer);
console.log("BP parsed via the real parseSsrv089BpGreyTotals:", bpParsed);

const existingBpUpload = await loadRawReportUpload(DATE, BRANCH, "ssrv089_bp");
console.log("Current (wrong/corrupt) BP file on file:", existingBpUpload);

if (!COMMIT) {
  console.log("\nDry run — re-run with --commit to write.");
  process.exit(0);
}

const uploadedAt = new Date().toISOString();

const gsClient = await pool.connect();
try {
  await gsClient.query("begin");
  await saveSsrv089Snapshot({ date: DATE, branch: BRANCH, variant: "general", uploadedAt, sourceFileName: GS_FILE_NAME, totals }, gsClient);
  await saveRawUploadRows(
    { reportType: "ssrv089", date: DATE, uploadedAt, sourceFileName: GS_FILE_NAME, rows: rawRows.map((data) => ({ branch: BRANCH, data })) },
    gsClient
  );
  await gsClient.query("commit");
} catch (err) {
  await gsClient.query("rollback");
  throw err;
} finally {
  gsClient.release();
}
await recomputeAfterSsrv089Upload(BRANCH, DATE);
console.log("GS committed.");

await saveRawReportUpload({ date: DATE, branch: BRANCH, reportType: "ssrv089_bp", uploadedAt, sourceFileName: BP_FILE_NAME, fileData: bpBuffer });
await saveSsrv089BpGreySnapshot({ date: DATE, branch: BRANCH, uploadedAt, sourceFileName: BP_FILE_NAME, totals: bpParsed.totals });
console.log("BP committed.");

const afterGs = await loadSsrv089Snapshot(DATE, BRANCH, "general");
const afterBp = await loadRawReportUpload(DATE, BRANCH, "ssrv089_bp");
const { rows: afterGrey } = await pool.query(`select * from ssrv089_bp_grey_snapshots where branch=$1 and date=$2`, [BRANCH, DATE]);
console.log("\nNew GS snapshot:", afterGs);
console.log("New BP file on file:", afterBp);
console.log("New Grey snapshot:", afterGrey);
await pool.end();
