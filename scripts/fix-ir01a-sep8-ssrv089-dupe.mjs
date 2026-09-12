// IR01A: the 8 Sep "Cost and Sales Report - GS" (SSRV089) upload turned out to
// be a fresh 1-8 Sep cumulative export, landing on the 8 Sep snapshot slot on
// top of the existing 3 Sep (a 1-4 Sep cumulative) and 7 Sep (single-day)
// snapshots. Real days 1,2,3,4(partial),7 were then double-counted in the
// accessories deduction sum. Verified row-for-row: the 8 Sep upload is a
// strict superset of both older snapshots (same job orders/amounts on the
// overlapping days), so the fix is to delete the now-redundant 3 Sep and 7
// Sep `ssrv089` snapshots + raw rows, leaving 8 Sep as the sole holder of the
// 1-8 Sep cumulative. scom205 / part_sale / service_info are untouched.
//
//   node scripts/fix-ir01a-sep8-ssrv089-dupe.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "IR01A";
const DUPE_DATES = ["2026-09-03", "2026-09-07"];

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: before } = await client.query(
    `select date::text, accessories_part_sale, accessories_labour_sale
       from ssrv089_snapshots where branch=$1 and variant='general' and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("Before:", before);

  const { rows: rawCount } = await client.query(
    `select date::text, count(*) from raw_upload_rows where branch=$1 and report_type='ssrv089' and date = any($2::date[]) group by date`,
    [BRANCH, DUPE_DATES]
  );
  console.log("Raw rows to delete:", rawCount);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(
    `delete from ssrv089_snapshots where branch=$1 and variant='general' and date = any($2::date[])`,
    [BRANCH, DUPE_DATES]
  );
  const delRaw = await client.query(
    `delete from raw_upload_rows where branch=$1 and report_type='ssrv089' and date = any($2::date[])`,
    [BRANCH, DUPE_DATES]
  );
  await client.query("commit");
  console.log(`\nCommitted. Deleted ${delSnap.rowCount} snapshot(s), ${delRaw.rowCount} raw row(s).`);

  const { rows: after } = await client.query(
    `select date::text, accessories_part_sale, accessories_labour_sale
       from ssrv089_snapshots where branch=$1 and variant='general' and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("After:", after);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
