// TI01B's September "Service Information Report - GS" uploads are each a
// cumulative month-to-date export, not single-day files — verified: every
// job order in the 3 Sep upload is also in 8 Sep; every job order in 8 Sep
// is in 9 Sep; every job order in 9 Sep is in 10 Sep (strict supersets,
// 257/504/575/643 rows). The MTD formula sums every snapshot in the month,
// so Evaporator Cleaning came out 217 (31+56+63+67) instead of the real 67;
// same overcount on Wheel Balancing (30 vs 9), Wheel Alignment (24 vs 7),
// Brake Skimming (12 vs 4). Fix: delete the superseded 3/8/9 Sep snapshots
// + raw rows, leaving 10 Sep as the sole (and already-cumulative) holder —
// same remedy as the IR01A/CO01B cumulative-upload fixes earlier this month.
//
//   node scripts/fix-ti01b-sep-service-info-cumulative.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01B";
const SUPERSEDED_DATES = ["2026-09-03", "2026-09-08", "2026-09-09"];

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: before } = await client.query(
    `select date::text, wheel_balancing, wheel_alignment, brake_skimming, evaporator_cleaning, vas_revenue
       from service_info_snapshots where branch=$1 and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("Before:", before);

  const { rows: rawCount } = await client.query(
    `select date::text, count(*) from raw_upload_rows where branch=$1 and report_type='service_info' and date = any($2::date[]) group by date`,
    [BRANCH, SUPERSEDED_DATES]
  );
  console.log("Raw rows to delete:", rawCount);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(
    `delete from service_info_snapshots where branch=$1 and date = any($2::date[])`,
    [BRANCH, SUPERSEDED_DATES]
  );
  const delRaw = await client.query(
    `delete from raw_upload_rows where branch=$1 and report_type='service_info' and date = any($2::date[])`,
    [BRANCH, SUPERSEDED_DATES]
  );
  await client.query("commit");
  console.log(`\nCommitted. Deleted ${delSnap.rowCount} snapshot(s), ${delRaw.rowCount} raw row(s).`);

  const { rows: after } = await client.query(
    `select date::text, wheel_balancing, wheel_alignment, brake_skimming, evaporator_cleaning, vas_revenue
       from service_info_snapshots where branch=$1 and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("After:", after);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
