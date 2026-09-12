// KY01A's Service Info Report for one round is a byte-for-byte re-upload of
// the previous round's file — same filename (Service_Info_Report-GS.csv),
// same 121 rows, same values (WB=5, WA=10, BS=1, EC=7, VAS=₹46,982),
// confirmed identical row-for-row. The MTD formula sums every snapshot in
// the month, so that one day's data was counted twice.
//
// Found 2026-09-12 as dates 8/9 Sep (uploaded_at 10/11 Sep). By the time
// this fix was written, KY01A's whole September date range had shifted +1
// day under an unrelated correction (same uploaded_at timestamps, date
// column incremented) — re-verified against current uploaded_at rather than
// trusting the original date labels: the surviving pair is now dated 9/10
// Sep (uploaded_at unchanged at 10/11 Sep). The 9 Sep upload (uploaded_at
// 2026-09-10T04:06:22Z) is the real one; the 10 Sep upload (uploaded_at
// 2026-09-11T04:03:39Z) is the resend — that round's real business data was
// never actually uploaded. Fix: delete the superseded 10 Sep snapshot + raw
// rows, leaving 9 Sep as the sole (real) holder — same remedy as the
// TI01B/CO01B cumulative-upload fixes. KY01A owes a fresh file for 10 Sep.
//
//   node scripts/fix-ky01a-sep09-service-info-dupe.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "KY01A";
const SUPERSEDED_DATES = ["2026-09-10"];

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: before } = await client.query(
    `select date::text, wheel_balancing, wheel_alignment, brake_skimming, evaporator_cleaning, vas_revenue, source_file_name
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

  const { rows: rawCount } = await client.query(
    `select date::text, count(*) from raw_upload_rows where branch=$1 and report_type='service_info' and date = any($2::date[]) group by date`,
    [BRANCH, SUPERSEDED_DATES]
  );
  console.log("Raw rows to delete:", rawCount);

  // Safety check: the target row must still be the resend (uploaded_at
  // 2026-09-11T04:03:39Z, WB=5/WA=10/VAS=46982) — dates already shifted once
  // between this bug being found and this script being written, so don't
  // trust the date label alone.
  const target = before.find((r) => r.date === SUPERSEDED_DATES[0]);
  const expected = { wheel_balancing: 5, wheel_alignment: 10, brake_skimming: 1, evaporator_cleaning: 7, vas_revenue: "46982" };
  const matches = target && Object.entries(expected).every(([k, v]) => String(target[k]) === String(v));
  if (!matches) {
    console.error("\nABORT: target row no longer matches the expected duplicate content. Re-investigate before deleting.", target);
    process.exit(1);
  }

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
