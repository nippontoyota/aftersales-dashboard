// TI01C's "13 Sep" SSRV089-General upload is a cumulative export — 167
// rows, a clean superset of the existing 10 Sep snapshot (42/42 JobOrder No
// present). Same pattern as the Service Info-GS/Part Sale cumulative fixes
// today. Left alone, the 10th's accessories deduction would double-count
// into GUS Parts/Labour MTD.
//
// Deletes the now-redundant 10 Sep snapshot + raw rows, leaving 13 Sep as
// the sole holder for the 10-13 Sep span.
//
//   node scripts/fix-ti01c-sep13-ssrv089-cumulative.mjs [--commit]
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
    `select date::text, source_file_name, accessories_part_sale, accessories_labour_sale
       from ssrv089_snapshots where branch=$1 and variant='general' and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("Before:", before);
  const { rows: mtdBefore } = await client.query(
    `select sum(accessories_part_sale) aps, sum(accessories_labour_sale) als
       from ssrv089_snapshots where branch=$1 and variant='general' and date >= '2026-09-01'`,
    [BRANCH]
  );
  console.log("MTD before:", mtdBefore[0]);

  const { rows: newRows } = await client.query(
    `select row_data->>'JobOrder No' as jo from raw_upload_rows where report_type='ssrv089' and branch=$1 and date=$2`,
    [BRANCH, CUMULATIVE_DATE]
  );
  const newJobOrders = new Set(newRows.map((r) => r.jo));
  const { rows: oldRows } = await client.query(
    `select row_data->>'JobOrder No' as jo from raw_upload_rows where report_type='ssrv089' and branch=$1 and date=$2`,
    [BRANCH, SUPERSEDED_DATE]
  );
  const missing = [...new Set(oldRows.map((r) => r.jo))].filter((jo) => !newJobOrders.has(jo));
  if (oldRows.length === 0 || missing.length > 0) {
    console.error("\nABORT: no longer a clean subset. Re-investigate.", { oldRowCount: oldRows.length, missing });
    process.exit(1);
  }
  console.log(`Safety check passed: all ${new Set(oldRows.map((r) => r.jo)).size} JobOrder Nos from ${SUPERSEDED_DATE} present in ${CUMULATIVE_DATE}.`);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(`delete from ssrv089_snapshots where branch=$1 and variant='general' and date=$2`, [BRANCH, SUPERSEDED_DATE]);
  const delRaw = await client.query(`delete from raw_upload_rows where branch=$1 and report_type='ssrv089' and date=$2`, [BRANCH, SUPERSEDED_DATE]);
  await client.query("commit");
  console.log(`\nCommitted. Deleted ${delSnap.rowCount} snapshot(s), ${delRaw.rowCount} raw row(s).`);

  const { rows: mtdAfter } = await client.query(
    `select sum(accessories_part_sale) aps, sum(accessories_labour_sale) als
       from ssrv089_snapshots where branch=$1 and variant='general' and date >= '2026-09-01'`,
    [BRANCH]
  );
  console.log("MTD after:", mtdAfter[0]);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
