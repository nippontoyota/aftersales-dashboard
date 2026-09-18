// TR01B's September "Service Information Report - BP" uploads for 1/2/3 Sep
// are each a cumulative export, not single-day files — verified row-for-row:
// every row in the 1 Sep file is also in 2 Sep; every row in 2 Sep is also in
// 3 Sep (strict supersets, 4/51/69 rows). Job order BPJ2600753 (a Toyota
// Glanza wheel alignment) stayed open and was carried into both the 2 Sep and
// 3 Sep exports, so the MTD sum double-counted it: Wheel Alignment came out 4
// instead of the real 3 (branch confirmed only 3 were done). Wheel Balancing,
// Brake Skimming and VAS Revenue are already 0 on all three dates, so nothing
// else is affected. Fix: delete the superseded 1/2 Sep snapshots, leaving 3
// Sep (already cumulative over both) as the sole holder — same remedy as
// fix-ti01b-sep-service-info-cumulative.mjs. The raw uploaded files in
// raw_report_uploads are untouched (that table is just an upload-lock/audit
// record, never summed directly).
//
//   node scripts/fix-tr01b-sep-service-info-bp-cumulative.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TR01B";
const SUPERSEDED_DATES = ["2026-09-01", "2026-09-02"];

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rows: before } = await client.query(
    `select date::text, wheel_balancing, wheel_alignment, brake_skimming, vas_revenue
       from service_info_bp_snapshots where branch=$1 and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("Before:", before);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(
    `delete from service_info_bp_snapshots where branch=$1 and date = any($2::date[])`,
    [BRANCH, SUPERSEDED_DATES]
  );
  await client.query("commit");
  console.log(`\nCommitted. Deleted ${delSnap.rowCount} snapshot(s).`);

  const { rows: after } = await client.query(
    `select date::text, wheel_balancing, wheel_alignment, brake_skimming, vas_revenue
       from service_info_bp_snapshots where branch=$1 and date >= '2026-09-01' order by date`,
    [BRANCH]
  );
  console.log("After:", after);
  const mtdWa = after.reduce((s, r) => s + Number(r.wheel_alignment), 0);
  console.log("Wheel Alignment MTD:", mtdWa);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
