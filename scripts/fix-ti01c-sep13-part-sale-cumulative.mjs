// TI01C's "13 Sep" Part Sale upload is a cumulative export — 573 rows, a
// clean superset of both the existing 10 Sep (67/67 BillNo present) and
// 11 Sep (60/60 BillNo present) snapshots. Same pattern as the Service
// Info-GS cumulative fix earlier today. Left alone, both the 10th and 11th
// would double-count into MTD.
//
// Deletes the now-redundant 10 Sep and 11 Sep snapshots + raw rows, leaving
// 13 Sep as the sole holder for the 10-13 Sep span.
//
//   node scripts/fix-ti01c-sep13-part-sale-cumulative.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01C";
const SUPERSEDED_DATES = ["2026-09-10", "2026-09-11"];
const CUMULATIVE_DATE = "2026-09-13";

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: before } = await client.query(
    `select date::text, source_file_name, engine_flush, injector_cleaner, synthetic_oil_ltrs, brake_cleaning_spray, external_sales, diy_count, diy_revenue
       from part_sale_snapshots where branch=$1 and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("Before:", before);
  const { rows: mtdBefore } = await client.query(
    `select sum(engine_flush) ef, sum(injector_cleaner) ic, sum(synthetic_oil_ltrs) so, sum(brake_cleaning_spray) bcs, sum(external_sales) es, sum(diy_count) dc, sum(diy_revenue) dr
       from part_sale_snapshots where branch=$1 and date >= '2026-09-01'`,
    [BRANCH]
  );
  console.log("MTD before:", mtdBefore[0]);

  const { rows: newRows } = await client.query(
    `select row_data->>'BillNo' as bn from raw_upload_rows where report_type='part_sale' and branch=$1 and date=$2`,
    [BRANCH, CUMULATIVE_DATE]
  );
  const newBillNos = new Set(newRows.map((r) => r.bn));
  for (const supersededDate of SUPERSEDED_DATES) {
    const { rows: oldRows } = await client.query(
      `select row_data->>'BillNo' as bn from raw_upload_rows where report_type='part_sale' and branch=$1 and date=$2`,
      [BRANCH, supersededDate]
    );
    const missing = [...new Set(oldRows.map((r) => r.bn))].filter((bn) => !newBillNos.has(bn));
    if (oldRows.length === 0 || missing.length > 0) {
      console.error(`\nABORT: ${supersededDate} is no longer a clean subset of ${CUMULATIVE_DATE}. Re-investigate.`, { oldRowCount: oldRows.length, missing });
      process.exit(1);
    }
    console.log(`Safety check passed for ${supersededDate}: all ${new Set(oldRows.map((r) => r.bn)).size} BillNos present in ${CUMULATIVE_DATE}.`);
  }

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(`delete from part_sale_snapshots where branch=$1 and date = any($2::date[])`, [BRANCH, SUPERSEDED_DATES]);
  const delRaw = await client.query(`delete from raw_upload_rows where branch=$1 and report_type='part_sale' and date = any($2::date[])`, [BRANCH, SUPERSEDED_DATES]);
  await client.query("commit");
  console.log(`\nCommitted. Deleted ${delSnap.rowCount} snapshot(s), ${delRaw.rowCount} raw row(s).`);

  const { rows: mtdAfter } = await client.query(
    `select sum(engine_flush) ef, sum(injector_cleaner) ic, sum(synthetic_oil_ltrs) so, sum(brake_cleaning_spray) bcs, sum(external_sales) es, sum(diy_count) dc, sum(diy_revenue) dr
       from part_sale_snapshots where branch=$1 and date >= '2026-09-01'`,
    [BRANCH]
  );
  console.log("MTD after:", mtdAfter[0]);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
