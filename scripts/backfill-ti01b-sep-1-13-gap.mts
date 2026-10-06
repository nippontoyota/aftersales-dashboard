// Backfills TI01B's September 1-13 SSRV089-GS gap, 1-13 SSRV089-BP gap, and
// 1-14 Part Sale gap — see docs/data-reconciliation.md and the conversation
// this shipped from: those dates' snapshots + raw rows were found deleted
// with no trace (deleted_rows_log didn't exist yet at the time), inflating
// GUS Parts/Labour MTD by under-deducting Accessories for that span.
//
// Files supplied by the user, each a single cumulative export (TI01B's
// well-documented standing pattern for every report type):
//   GS_CostAndSalesReport-TI01B 01-13.09.2026.xlsx   (ssrv089, general)
//   BP_CostAndSalesReport-TI01B 01-13.09.2026.xlsx   (ssrv089, body_paint)
//   PartSaleReport-TI01B 01-14.09.2026.xlsx          (part_sale)
//
// Each is verified by its own rows' real dates (never the filename) before
// anything is written — see feedback_verify_uploads_by_row_dates_not_filename.
// Filed under the LAST date in each file's real span (2026-09-13 for the two
// Cost & Sales files, 2026-09-14 for Part Sale), matching every prior
// TI01B cumulative-upload fix in this repo (service_info/part_sale/ssrv089
// all used "file under the latest date" as the holder) and leaving the
// already-correct 14th (GS)/15th (Part Sale) daily snapshots untouched.
//
//   npx tsx scripts/backfill-ti01b-sep-1-13-gap.mts [--commit]
import fs from "fs";
import "./load-env.mjs";
import { pool } from "../src/lib/db.ts";
import { listAccessoriesStaffNamesForBranch } from "../src/lib/accessories-staff-store.ts";
import { logDeletedRows } from "../src/lib/audit/deleted-rows-log.ts";
import { recomputeAfterSsrv089Upload } from "../src/lib/cancellation/adjustment-recompute.ts";
import { parsePartSaleWorkbook } from "../src/lib/part-sale/parse.ts";
import { saveRawUploadRows } from "../src/lib/raw-upload-rows/store.ts";
import { saveRawReportUpload } from "../src/lib/raw-report-uploads/store.ts";
import { savePartSaleSnapshot, loadPartSaleSnapshot } from "../src/lib/part-sale/store.ts";
import { parseSsrv089Workbook } from "../src/lib/ssrv089/parse.ts";
import { saveSsrv089Snapshot, loadSsrv089Snapshot } from "../src/lib/ssrv089/store.ts";
import { parseSsrv089BpGreyTotals } from "../src/lib/ssrv089-bp/parse.ts";
import { saveSsrv089BpGreySnapshot } from "../src/lib/ssrv089-bp/store.ts";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01B";
const DOWNLOADS = "C:\\Users\\Nippon\\Downloads\\";
const GS_PATH = DOWNLOADS + "GS_CostAndSalesReport-TI01B 01-13.09.2026.xlsx";
const BP_PATH = DOWNLOADS + "BP_CostAndSalesReport-TI01B 01-13.09.2026.xlsx";
const PART_SALE_PATH = DOWNLOADS + "PartSaleReport-TI01B 01-14.09.2026.xlsx";

const GS_DATE = "2026-09-13";
const PART_SALE_DATE = "2026-09-14";
// BP days this new cumulative file supersedes (already-present partial/
// cumulative uploads, all strictly contained within it per TI01B's
// established pattern) — verified below before anything is deleted.
const BP_SUPERSEDED_DATES = ["2026-09-03", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"];

// These two files are genuine .xlsx date cells, not ambiguous CSV text —
// read with { raw: false } they come back as SheetJS's own M/D/YY
// rendering (unambiguous: confirmed against the real data below, every
// first component is 9, every second component 1-14), not the day-first
// CSV-text format ssrv089/upload-validation.ts's comment refers to.
function mdyyToIso(value) {
  const m = String(value ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  const [, mo, d, y] = m;
  return `20${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function dateRange(isoDates) {
  const valid = isoDates.filter(Boolean).sort();
  return valid.length === 0 ? null : { min: valid[0], max: valid[valid.length - 1], count: valid.length, total: isoDates.length };
}

console.log(`=== TI01B September gap backfill — ${COMMIT ? "COMMIT" : "DRY RUN"} ===\n`);

// --- GS (ssrv089 general) ---
console.log("--- GS (SSRV089-General) ---");
const gsBuffer = fs.readFileSync(GS_PATH);
const staffNames = await listAccessoriesStaffNamesForBranch(BRANCH);
const { totals: gsTotals, rawRows: gsRows } = parseSsrv089Workbook(gsBuffer, staffNames);
const gsBranchMismatch = gsRows.filter((r) => String(r["Branch Code"] ?? "").trim() !== BRANCH);
const gsDates = dateRange(gsRows.map((r) => mdyyToIso(r["Invoice Doc Date"])));
console.log(`Rows: ${gsRows.length}  Branch-code mismatches: ${gsBranchMismatch.length}`);
console.log(`Invoice Doc Date range:`, gsDates);
console.log(`Totals:`, gsTotals);
const gsExisting = await loadSsrv089Snapshot(GS_DATE, BRANCH, "general");
console.log(`Existing snapshot on ${GS_DATE} (should be none):`, gsExisting);

// --- Part Sale ---
console.log("\n--- Part Sale ---");
const partSaleBuffer = fs.readFileSync(PART_SALE_PATH);
const { counts: partSaleCounts, rawRows: partSaleRows } = await parsePartSaleWorkbook(partSaleBuffer, BRANCH, PART_SALE_DATE);
const partSaleDates = dateRange(partSaleRows.map((r) => mdyyToIso(r["SaleDate"])));
console.log(`Rows: ${partSaleRows.length}`);
console.log(`SaleDate range (TI01B isn't in the known non-standard SaleDate-encoding list, e.g. TI01C/IR01A):`, partSaleDates);
console.log(`Counts:`, partSaleCounts);
const partSaleExisting = await loadPartSaleSnapshot(PART_SALE_DATE, BRANCH);
console.log(`Existing snapshot on ${PART_SALE_DATE} (should be none):`, partSaleExisting);

// --- BP (ssrv089 body_paint, grey-only) ---
console.log("\n--- BP (SSRV089-BP) ---");
const bpBuffer = fs.readFileSync(BP_PATH);
const bpParsed = parseSsrv089BpGreyTotals(bpBuffer);
console.log(`Row count: ${bpParsed.rowCount}  isEmpty: ${bpParsed.isEmpty}`);
console.log(`Grey totals (TI01B isn't in GREY_REVENUE_BRANCHES, so this doesn't feed any dashboard figure):`, bpParsed.totals);

const existingBp = await pool.query(
  `select date::text, source_file_name, octet_length(file_data) as bytes from raw_report_uploads
     where branch=$1 and report_type='ssrv089_bp' and date = any($2::date[]) order by date`,
  [BRANCH, BP_SUPERSEDED_DATES]
);
console.log(`Existing BP uploads on the dates this new file should supersede:`);
console.table(existingBp.rows);

if (!COMMIT) {
  console.log("\nDry run — re-run with --commit to write.");
  await pool.end();
  process.exit(0);
}

// --- Write: GS ---
const uploadedAt = new Date().toISOString();
const gsClient = await pool.connect();
try {
  await gsClient.query("begin");
  await saveSsrv089Snapshot(
    { date: GS_DATE, branch: BRANCH, variant: "general", uploadedAt, sourceFileName: "GS_CostAndSalesReport-TI01B 01-13.09.2026.xlsx", totals: gsTotals },
    gsClient
  );
  await saveRawUploadRows(
    { reportType: "ssrv089", date: GS_DATE, uploadedAt, sourceFileName: "GS_CostAndSalesReport-TI01B 01-13.09.2026.xlsx", rows: gsRows.map((data) => ({ branch: BRANCH, data })) },
    gsClient
  );
  await gsClient.query("commit");
} catch (err) {
  await gsClient.query("rollback");
  throw err;
} finally {
  gsClient.release();
}
await recomputeAfterSsrv089Upload(BRANCH, GS_DATE);
console.log(`\nGS committed under ${GS_DATE}.`);

// --- Write: Part Sale ---
const psClient = await pool.connect();
try {
  await psClient.query("begin");
  await savePartSaleSnapshot(
    { date: PART_SALE_DATE, branch: BRANCH, uploadedAt, sourceFileName: "PartSaleReport-TI01B 01-14.09.2026.xlsx", counts: partSaleCounts },
    psClient
  );
  await saveRawUploadRows(
    { reportType: "part_sale", date: PART_SALE_DATE, uploadedAt, sourceFileName: "PartSaleReport-TI01B 01-14.09.2026.xlsx", rows: partSaleRows.map((data) => ({ branch: BRANCH, data })) },
    psClient
  );
  await psClient.query("commit");
} catch (err) {
  await psClient.query("rollback");
  throw err;
} finally {
  psClient.release();
}
console.log(`Part Sale committed under ${PART_SALE_DATE}.`);

// --- Write: BP (supersede the now-redundant partial dates, then save the new cumulative file under GS_DATE) ---
const bpClient = await pool.connect();
try {
  await bpClient.query("begin");
  await logDeletedRows(bpClient, "raw_report_uploads", "backfill-ti01b-sep-1-13-gap.mts", "branch = $1 and report_type = 'ssrv089_bp' and date = any($2::date[])", [BRANCH, BP_SUPERSEDED_DATES]);
  await bpClient.query(`delete from raw_report_uploads where branch=$1 and report_type='ssrv089_bp' and date = any($2::date[])`, [BRANCH, BP_SUPERSEDED_DATES]);
  await bpClient.query("commit");
} catch (err) {
  await bpClient.query("rollback");
  throw err;
} finally {
  bpClient.release();
}
await saveRawReportUpload({ date: GS_DATE, branch: BRANCH, reportType: "ssrv089_bp", uploadedAt, sourceFileName: "BP_CostAndSalesReport-TI01B 01-13.09.2026.xlsx", fileData: bpBuffer });
await saveSsrv089BpGreySnapshot({ date: GS_DATE, branch: BRANCH, uploadedAt, sourceFileName: "BP_CostAndSalesReport-TI01B 01-13.09.2026.xlsx", totals: bpParsed.totals });
console.log(`BP committed under ${GS_DATE}; superseded dates removed (audit-logged).`);

await pool.end();
console.log("\nDone.");
