// TI01B's September "Part Sale Report" uploads are each a cumulative
// month-to-date export too (same failure mode as the Service Info fix,
// scripts/fix-ti01b-sep-service-info-cumulative.mjs) — verified: every
// Bill No in the 3 Sep upload is also in 8 Sep; every one in 8 Sep is in
// 9 Sep; every one in 9 Sep is in 10 Sep (226/474/536/602 distinct bills,
// strict supersets, same filename "PartSaleReport-TI01B.xlsx" every time).
// MTD summed all 4 snapshots instead of reading the latest, inflating
// Engine Flush, Injector Cleaner, Synthetic Oil, Brake Cleaning Spray, and
// External Sales.
//
//   node scripts/fix-ti01b-sep-part-sale-cumulative.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01B";
const SUPERSEDED_DATES = ["2026-09-03", "2026-09-08", "2026-09-09"];

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: before } = await client.query(
    `select date::text, engine_flush, injector_cleaner, synthetic_oil_ltrs, brake_cleaning_spray, external_sales, diy_count, diy_revenue
       from part_sale_snapshots where branch=$1 and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("Before:", before);

  const { rows: rawCount } = await client.query(
    `select date::text, count(*) from raw_upload_rows where branch=$1 and report_type='part_sale' and date = any($2::date[]) group by date`,
    [BRANCH, SUPERSEDED_DATES]
  );
  console.log("Raw rows to delete:", rawCount);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(
    `delete from part_sale_snapshots where branch=$1 and date = any($2::date[])`,
    [BRANCH, SUPERSEDED_DATES]
  );
  const delRaw = await client.query(
    `delete from raw_upload_rows where branch=$1 and report_type='part_sale' and date = any($2::date[])`,
    [BRANCH, SUPERSEDED_DATES]
  );
  await client.query("commit");
  console.log(`\nCommitted. Deleted ${delSnap.rowCount} snapshot(s), ${delRaw.rowCount} raw row(s).`);

  const { rows: after } = await client.query(
    `select date::text, engine_flush, injector_cleaner, synthetic_oil_ltrs, brake_cleaning_spray, external_sales, diy_count, diy_revenue
       from part_sale_snapshots where branch=$1 and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("After:", after);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
