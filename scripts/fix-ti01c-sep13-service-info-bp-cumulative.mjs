// TI01C's "13 Sep" Service Info-BP upload is a cumulative export — 93 rows,
// a clean superset of the existing 10 Sep BP snapshot (9/9 Job Order No
// present, verified by parsing both raw file blobs directly since BP
// uploads don't keep parsed raw rows like every other report type). Same
// pattern as the GS/Part Sale/SSRV089 cumulative fixes today.
//
// Deletes the now-redundant 10 Sep BP snapshot + raw file record, leaving
// 13 Sep as the sole holder for the 10-13 Sep span.
//
//   node scripts/fix-ti01c-sep13-service-info-bp-cumulative.mjs [--commit]
import { Client } from "pg";
import * as XLSX from "xlsx";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01C";
const SUPERSEDED_DATE = "2026-09-10";
const CUMULATIVE_DATE = "2026-09-13";

function jobOrdersFromFile(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return new Set(rows.map((r) => r["Job Order No"]));
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: before } = await client.query(
    `select date::text, source_file_name, wheel_balancing, wheel_alignment, brake_skimming, vas_revenue
       from service_info_bp_snapshots where branch=$1 and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("Before:", before);
  const { rows: mtdBefore } = await client.query(
    `select sum(wheel_balancing) wb, sum(wheel_alignment) wa, sum(brake_skimming) bs, sum(vas_revenue) vas
       from service_info_bp_snapshots where branch=$1 and date >= '2026-09-01'`,
    [BRANCH]
  );
  console.log("MTD before:", mtdBefore[0]);

  const { rows: newFile } = await client.query(
    `select file_data from raw_report_uploads where branch=$1 and report_type='service_info_bp' and date=$2`,
    [BRANCH, CUMULATIVE_DATE]
  );
  const { rows: oldFile } = await client.query(
    `select file_data from raw_report_uploads where branch=$1 and report_type='service_info_bp' and date=$2`,
    [BRANCH, SUPERSEDED_DATE]
  );
  if (newFile.length === 0 || oldFile.length === 0) {
    console.error("\nABORT: missing raw file for one of the dates.", { hasNew: newFile.length > 0, hasOld: oldFile.length > 0 });
    process.exit(1);
  }
  const newJobOrders = jobOrdersFromFile(newFile[0].file_data);
  const oldJobOrders = jobOrdersFromFile(oldFile[0].file_data);
  const missing = [...oldJobOrders].filter((jo) => !newJobOrders.has(jo));
  if (missing.length > 0) {
    console.error("\nABORT: no longer a clean subset. Re-investigate.", { missing });
    process.exit(1);
  }
  console.log(`Safety check passed: all ${oldJobOrders.size} Job Order Nos from ${SUPERSEDED_DATE} present in ${CUMULATIVE_DATE}.`);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(`delete from service_info_bp_snapshots where branch=$1 and date=$2`, [BRANCH, SUPERSEDED_DATE]);
  const delRaw = await client.query(`delete from raw_report_uploads where branch=$1 and report_type='service_info_bp' and date=$2`, [BRANCH, SUPERSEDED_DATE]);
  await client.query("commit");
  console.log(`\nCommitted. Deleted ${delSnap.rowCount} snapshot(s), ${delRaw.rowCount} raw upload record(s).`);

  const { rows: mtdAfter } = await client.query(
    `select sum(wheel_balancing) wb, sum(wheel_alignment) wa, sum(brake_skimming) bs, sum(vas_revenue) vas
       from service_info_bp_snapshots where branch=$1 and date >= '2026-09-01'`,
    [BRANCH]
  );
  console.log("MTD after:", mtdAfter[0]);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
