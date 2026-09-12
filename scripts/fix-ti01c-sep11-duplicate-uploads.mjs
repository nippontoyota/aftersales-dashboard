// TI01C's 11 Sep uploads for scom205, SSRV089-General, and Service Info-GS
// are all stale duplicates of the 10 Sep files (identical figures, same
// filenames) — confirmed 2026-09-12 by cross-checking against BA Tool's own
// numbers, which show real growth on the 11th (GUS RO 274->311, BPU RO
// 37->43), so the branch simply resubmitted yesterday's files instead of
// pulling fresh ones for these three reports. See docs/data-reconciliation.md.
//
// Deletes the 11 Sep snapshot + raw rows for all three report types,
// reverting to "not yet uploaded for the 11th" — correct until TI01C
// uploads the real files. Their scom205 MTD read then falls back to the
// (real) 10 Sep figure; Service Info / SSRV089 MTD sums simply exclude the
// 11th until it's re-uploaded.
//
//   node scripts/fix-ti01c-sep11-duplicate-uploads.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01C";
const DATE = "2026-09-11";

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: scom205Before } = await client.query(
    `select date::text, source_file_name, gus_sp_rev_mtd, gus_lab_rev_mtd, bpu_sp_rev_mtd, bpu_lab_rev_mtd from scom205_snapshots where branch=$1 and date=$2`,
    [BRANCH, DATE]
  );
  const { rows: ssrvBefore } = await client.query(
    `select date::text, source_file_name, accessories_part_sale, accessories_labour_sale from ssrv089_snapshots where branch=$1 and variant='general' and date=$2`,
    [BRANCH, DATE]
  );
  const { rows: siBefore } = await client.query(
    `select date::text, source_file_name, wheel_balancing, wheel_alignment, brake_skimming, evaporator_cleaning, vas_revenue from service_info_snapshots where branch=$1 and date=$2`,
    [BRANCH, DATE]
  );
  console.log("scom205 before:", scom205Before);
  console.log("ssrv089-general before:", ssrvBefore);
  console.log("service_info before:", siBefore);

  const { rows: rawCounts } = await client.query(
    `select report_type, count(*) from raw_upload_rows where branch=$1 and date=$2 and report_type in ('scom205','ssrv089','service_info') group by report_type`,
    [BRANCH, DATE]
  );
  console.log("Raw rows to delete:", rawCounts);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delScom = await client.query(`delete from scom205_snapshots where branch=$1 and date=$2`, [BRANCH, DATE]);
  const delSsrv = await client.query(`delete from ssrv089_snapshots where branch=$1 and variant='general' and date=$2`, [BRANCH, DATE]);
  const delSi = await client.query(`delete from service_info_snapshots where branch=$1 and date=$2`, [BRANCH, DATE]);
  const delRaw = await client.query(
    `delete from raw_upload_rows where branch=$1 and date=$2 and report_type in ('scom205','ssrv089','service_info')`,
    [BRANCH, DATE]
  );
  await client.query("commit");
  console.log(
    `\nCommitted. Deleted scom205=${delScom.rowCount}, ssrv089-general=${delSsrv.rowCount}, service_info=${delSi.rowCount} snapshot(s), ${delRaw.rowCount} raw row(s).`
  );
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
