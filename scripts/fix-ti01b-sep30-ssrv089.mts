// TI01B's September 30 SSRV089-GS slot held the 14th's data, mislabeled
// (every one of its 64 rows carries Invoice Doc Date 14/09/2026 — uploaded
// via HQ's Upload Sheet, uploaded_by 'admin', 2026-10-01). So the real 30th
// never had its Accessories deduction captured, leaving GUS Parts/Labour
// MTD read too high by exactly that day's Accessories sales — confirmed
// against the user's own cross-check gap (Rs 61,642 parts / Rs 19,372
// labour) to the rupee.
//
// Source: the user's "CS service Nadathara.xls" — a fuller Cost & Sales
// export (1,258 rows, 665 distinct job orders) that's a clean superset of
// everything already on file (0 job orders in our DB are absent from it).
// Its 11 job orders / 19 line-items genuinely dated 30/09/2026 (exact
// string match on Invoice Doc Date, not inferred) are the real 30th —
// filtered out of the whole-month file below, not a direct daily DMS pull.
//
//   npx tsx scripts/fix-ti01b-sep30-ssrv089.mts [--commit]
import fs from "fs";
import "./load-env.mjs";
import { pool } from "../src/lib/db.ts";
import { isAccessoriesStaff } from "../src/lib/accessories-staff.ts";
import { listAccessoriesStaffNamesForBranch } from "../src/lib/accessories-staff-store.ts";
import { logDeletedRows } from "../src/lib/audit/deleted-rows-log.ts";
import { recomputeAfterSsrv089Upload } from "../src/lib/cancellation/adjustment-recompute.ts";
import { parseSsrv089Workbook } from "../src/lib/ssrv089/parse.ts";
import { saveSsrv089Snapshot, loadSsrv089Snapshot } from "../src/lib/ssrv089/store.ts";
import { saveRawUploadRows } from "../src/lib/raw-upload-rows/store.ts";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01B";
const DATE = "2026-09-30";
const SOURCE_PATH = "C:/Users/Nippon/Downloads/CS service Nadathara.xls";
const SOURCE_FILE_NAME = "CS service Nadathara.xls (filtered to 30/09/2026 rows)";

function toAmount(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

console.log(`=== Fix TI01B 30 Sep SSRV089-GS — ${COMMIT ? "COMMIT" : "DRY RUN"} ===\n`);

const staffNames = await listAccessoriesStaffNamesForBranch(BRANCH);
const buffer = fs.readFileSync(SOURCE_PATH);
const { rawRows: allRows } = parseSsrv089Workbook(buffer, staffNames);

const sep30Rows = allRows.filter((r) => String(r["Invoice Doc Date"]).trim() === "30/09/2026");
console.log(`Rows with Invoice Doc Date exactly "30/09/2026": ${sep30Rows.length}`);
const branchMismatch = sep30Rows.filter((r) => String(r["Branch Code"] ?? "").trim() !== BRANCH);
console.log(`Branch-code mismatches: ${branchMismatch.length}`);

let accessoriesPartSale = 0;
let accessoriesLabourSale = 0;
let greyPartSale = 0;
let greyLabourSale = 0;
for (const row of sep30Rows) {
  const closeSaName = String(row["Close SA Name"] ?? "");
  if (isAccessoriesStaff(staffNames, closeSaName)) {
    accessoriesPartSale += toAmount(row["Part Sale"]);
    accessoriesLabourSale += toAmount(row["Labour Sale"]);
  }
  const brand = String(row["Brand(Toyota/Grey)"] ?? "").trim().toUpperCase();
  if (brand === "GREY") {
    greyPartSale += toAmount(row["Part Sale"]);
    greyLabourSale += toAmount(row["Labour Sale"]);
  }
}
const totals = { accessoriesPartSale, accessoriesLabourSale, greyPartSale, greyLabourSale };
console.log("Computed totals for the real 30th:", totals);

const currentWrong = await loadSsrv089Snapshot(DATE, BRANCH, "general");
console.log(`\nCurrent (wrong) snapshot on ${DATE}:`, currentWrong);
const currentWrongRowCount = await pool.query(
  `select count(*) n from raw_upload_rows where branch=$1 and report_type='ssrv089' and date=$2`,
  [BRANCH, DATE]
);
console.log(`Current (wrong) raw row count on ${DATE}: ${currentWrongRowCount.rows[0].n}`);

if (!COMMIT) {
  console.log("\nDry run — re-run with --commit to write.");
  await pool.end();
  process.exit(0);
}

const uploadedAt = new Date().toISOString();
const client = await pool.connect();
try {
  await client.query("begin");

  await logDeletedRows(client, "ssrv089_snapshots", "fix-ti01b-sep30-ssrv089.mts", "branch=$1 and variant='general' and date=$2", [BRANCH, DATE]);
  await client.query(`delete from ssrv089_snapshots where branch=$1 and variant='general' and date=$2`, [BRANCH, DATE]);

  await logDeletedRows(client, "raw_upload_rows", "fix-ti01b-sep30-ssrv089.mts", "branch=$1 and report_type='ssrv089' and date=$2", [BRANCH, DATE]);
  await client.query(`delete from raw_upload_rows where branch=$1 and report_type='ssrv089' and date=$2`, [BRANCH, DATE]);

  await saveSsrv089Snapshot({ date: DATE, branch: BRANCH, variant: "general", uploadedAt, sourceFileName: SOURCE_FILE_NAME, totals }, client);
  await saveRawUploadRows(
    { reportType: "ssrv089", date: DATE, uploadedAt, sourceFileName: SOURCE_FILE_NAME, rows: sep30Rows.map((data) => ({ branch: BRANCH, data })) },
    client
  );

  await client.query("commit");
} catch (err) {
  await client.query("rollback");
  throw err;
} finally {
  client.release();
}

await recomputeAfterSsrv089Upload(BRANCH, DATE);
console.log(`\nCommitted — ${DATE} now holds the real data.`);

// Final corrected GUS Parts/Labour MTD
const ssrv = await pool.query(
  `select accessories_part_sale, accessories_labour_sale from ssrv089_snapshots where branch=$1 and variant='general' and date >= '2026-09-01' and date < '2026-10-01'`,
  [BRANCH]
);
const accPart = ssrv.rows.reduce((s, r) => s + Number(r.accessories_part_sale), 0);
const accLab = ssrv.rows.reduce((s, r) => s + Number(r.accessories_labour_sale), 0);
const scom = await pool.query(`select gus_sp_rev_mtd, gus_lab_rev_mtd from scom205_snapshots where branch=$1 and date='2026-09-30'`, [BRANCH]);
const gusSp = Number(scom.rows[0].gus_sp_rev_mtd);
const gusLab = Number(scom.rows[0].gus_lab_rev_mtd);
console.log(`\nFinal Accessories deduction MTD: parts Rs ${accPart.toFixed(2)}, labour Rs ${accLab.toFixed(2)}`);
console.log(`Final GUS Parts MTD  = Rs ${gusSp.toFixed(2)} - Rs ${accPart.toFixed(2)} = Rs ${(gusSp - accPart).toFixed(2)}`);
console.log(`Final GUS Labour MTD = Rs ${gusLab.toFixed(2)} - Rs ${accLab.toFixed(2)} = Rs ${(gusLab - accLab).toFixed(2)}`);

await pool.end();
