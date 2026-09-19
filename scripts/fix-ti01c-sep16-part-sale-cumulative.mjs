// TI01C's 16-Sep Part Sale upload turned out to be a full 1-16 Sep
// cumulative file (16 distinct SaleDate values on file), overlapping with 8
// days that already had their own standalone snapshots (3,6,7,8,9,13,14,15
// Sep) -- double-counting those days' External Sales / Engine Flush /
// Synthetic Oil / DIY revenue in MTD. Same shape as the TI01C/TI01B/MV01A
// fixes earlier this month (see docs/data-reconciliation.md) -- delete the
// now-redundant standalone snapshots, let the comprehensive 16-Sep upload
// stand alone for 1-16 Sep.
//
//   node scripts/fix-ti01c-sep16-part-sale-cumulative.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01C";
const REDUNDANT_DATES = ["2026-09-03", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-13", "2026-09-14", "2026-09-15"];

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  console.log(`${BRANCH} part_sale -- redundant standalone snapshots to remove (superseded by the 16-Sep 1-16 cumulative file):`);
  const { rows: snaps } = await client.query(
    `select date::text, external_sales, engine_flush, synthetic_oil_ltrs, diy_revenue
       from part_sale_snapshots where branch = $1 and date = any($2::date[]) order by date`,
    [BRANCH, REDUNDANT_DATES]
  );
  for (const s of snaps) console.log(`  ${s.date}  external_sales=${s.external_sales}  engine_flush=${s.engine_flush}  synthetic_oil=${s.synthetic_oil_ltrs}  diy_revenue=${s.diy_revenue}`);
  const { rows: rawCounts } = await client.query(
    `select date::text, count(*) rows from raw_upload_rows
      where report_type='part_sale' and branch=$1 and date = any($2::date[]) group by date order by date`,
    [BRANCH, REDUNDANT_DATES]
  );
  console.log("\nraw_upload_rows to remove:");
  for (const r of rawCounts) console.log(`  ${r.date}  ${r.rows} rows`);

  if (!COMMIT) {
    console.log("\nDry run -- re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(
    `delete from part_sale_snapshots where branch = $1 and date = any($2::date[])`,
    [BRANCH, REDUNDANT_DATES]
  );
  const delRaw = await client.query(
    `delete from raw_upload_rows where report_type='part_sale' and branch = $1 and date = any($2::date[])`,
    [BRANCH, REDUNDANT_DATES]
  );
  await client.query("commit");
  console.log(`\nCommitted. Deleted ${delSnap.rowCount} snapshot(s), ${delRaw.rowCount} raw row(s).`);

  const { rows: remaining } = await client.query(
    `select date::text, count(*) rows, count(distinct row_data->>'SaleDate') distinct_sd
       from raw_upload_rows where report_type='part_sale' and branch=$1 and date >= '2026-09-01'
       group by date order by date`,
    [BRANCH]
  );
  console.log("\nRemaining part_sale coverage for TI01C in September:");
  for (const r of remaining) console.log(`  ${r.date}  ${r.rows} rows, ${r.distinct_sd} distinct SaleDate(s)`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
