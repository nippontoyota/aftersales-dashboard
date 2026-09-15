// TI01C's "13 Sep" Service Info-GS upload is actually a cumulative export
// covering job orders closed on 10, 11, 12, AND 13 Sep (268 rows: 111 on the
// 10th, 93 on the 11th, 44 on the 12th, 18 on the 13th — confirmed via each
// row's "Job Close Date"). It's a clean superset of the existing 10 Sep
// snapshot: all 42 of that day's job orders are fully contained in the new
// file (plus 2 more), zero conflicts, zero overlap with the 9th. Left as-is,
// the 10th's business would be double-counted into MTD — once from the old
// standalone 10 Sep snapshot, again from inside the new 13 Sep file.
//
// Deletes the now-redundant 10 Sep snapshot + raw rows, leaving 13 Sep as
// the sole (already-cumulative) holder for the 10-13 Sep span — same remedy
// as the IR01A/TI01B cumulative-upload fixes earlier this month. This also
// finally gives TI01C real 11/12 Sep data (previously missing entirely).
//
//   node scripts/fix-ti01c-sep13-service-info-cumulative.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01C";
const SUPERSEDED_DATE = "2026-09-10";
const CUMULATIVE_DATE = "2026-09-13";

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: before } = await client.query(
    `select date::text, source_file_name, wheel_balancing, wheel_alignment, brake_skimming, evaporator_cleaning, vas_revenue
       from service_info_snapshots where branch=$1 and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("Before:", before);

  const { rows: mtdBefore } = await client.query(
    `select sum(wheel_balancing) wb, sum(wheel_alignment) wa, sum(brake_skimming) bs, sum(evaporator_cleaning) ec, sum(vas_revenue) vas
       from service_info_snapshots where branch=$1 and date >= '2026-09-01'`,
    [BRANCH]
  );
  console.log("MTD before:", mtdBefore[0]);

  // Safety check: every job order in the superseded date's raw rows must
  // still be present in the cumulative date's raw rows (a true superset) —
  // otherwise deleting the superseded snapshot would lose real data.
  const { rows: oldRows } = await client.query(
    `select row_data->>'Job Order No' as jo from raw_upload_rows where report_type='service_info' and branch=$1 and date=$2`,
    [BRANCH, SUPERSEDED_DATE]
  );
  const { rows: newRows } = await client.query(
    `select row_data->>'Job Order No' as jo from raw_upload_rows where report_type='service_info' and branch=$1 and date=$2`,
    [BRANCH, CUMULATIVE_DATE]
  );
  const newJobOrders = new Set(newRows.map((r) => r.jo));
  const missing = [...new Set(oldRows.map((r) => r.jo))].filter((jo) => !newJobOrders.has(jo));
  if (oldRows.length === 0 || missing.length > 0) {
    console.error("\nABORT: the cumulative file is no longer a clean superset of the superseded date. Re-investigate before deleting.", { oldRowCount: oldRows.length, missing });
    process.exit(1);
  }
  console.log(`\nSafety check passed: all ${new Set(oldRows.map((r) => r.jo)).size} job orders from ${SUPERSEDED_DATE} are present in ${CUMULATIVE_DATE}'s file.`);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(`delete from service_info_snapshots where branch=$1 and date=$2`, [BRANCH, SUPERSEDED_DATE]);
  const delRaw = await client.query(`delete from raw_upload_rows where branch=$1 and report_type='service_info' and date=$2`, [BRANCH, SUPERSEDED_DATE]);
  await client.query("commit");
  console.log(`\nCommitted. Deleted ${delSnap.rowCount} snapshot(s), ${delRaw.rowCount} raw row(s) for ${SUPERSEDED_DATE}.`);

  const { rows: mtdAfter } = await client.query(
    `select sum(wheel_balancing) wb, sum(wheel_alignment) wa, sum(brake_skimming) bs, sum(evaporator_cleaning) ec, sum(vas_revenue) vas
       from service_info_snapshots where branch=$1 and date >= '2026-09-01'`,
    [BRANCH]
  );
  console.log("MTD after:", mtdAfter[0]);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
