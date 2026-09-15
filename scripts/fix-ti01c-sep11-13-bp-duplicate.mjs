// Found 2026-09-15 during a full September audit: TI01C's Service Info-BP
// uploads for 10, 11, AND 13 Sep are byte-identical files (same
// "Service_Info_Report-TI01C-B&P.csv", confirmed via file-blob hash) — the
// same stale-resend pattern already fixed for TI01C's GS-variant Service
// Info / SSRV089-General / scom205 on 2026-09-15, just missed for the BP
// variant at the time since BP uploads don't keep parsed raw rows (only a
// file blob), so the earlier duplicate check didn't cover them.
//
// Impact is small but real: wheel_alignment=1 on all three dates, so the
// combined (GS+BP merged) Wheel Alignment MTD is currently counting it
// three times (3) instead of once (1) — the GS snapshot for 11/13 was
// already deleted in the earlier fix, but mergeGsAndBp synthesizes a
// standalone row from BP alone when GS is missing for that date, so the BP
// duplicate keeps inflating the total independently of the GS fix.
// Wheel Balancing / Brake Skimming / VAS Revenue are all 0 on every one of
// these three dates, so only Wheel Alignment is actually affected.
//
// Deletes the 11 Sep and 13 Sep service_info_bp snapshots + their
// raw_report_uploads file rows, reverting to "not yet uploaded" — same
// remedy as the GS-variant fix. Does NOT touch ssrv089_bp (also duplicated
// the same three dates) since that variant isn't read by report.ts for any
// calculation — noted, not fixed, per the cosmetic-vs-impactful rule.
//
//   node scripts/fix-ti01c-sep11-13-bp-duplicate.mjs [--commit]
import { Client } from "pg";
import crypto from "node:crypto";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01C";
const DATES = ["2026-09-11", "2026-09-13"];
const REFERENCE_DATE = "2026-09-10";

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: snaps } = await client.query(
    `select date::text, source_file_name, wheel_balancing, wheel_alignment, brake_skimming, vas_revenue
       from service_info_bp_snapshots where branch=$1 and date = any($2::date[]) order by date`,
    [BRANCH, [REFERENCE_DATE, ...DATES]]
  );
  console.log("service_info_bp snapshots:", snaps);

  // Safety check: all three dates must show identical MTD-driving values,
  // and the raw file blobs for 11/13 must hash-match the 10th's.
  const allIdentical = snaps.length === 3 && new Set(snaps.map((r) => JSON.stringify([r.wheel_balancing, r.wheel_alignment, r.brake_skimming, r.vas_revenue]))).size === 1;
  const { rows: files } = await client.query(
    `select date::text, file_data from raw_report_uploads where branch=$1 and report_type='service_info_bp' and date = any($2::date[]) order by date`,
    [BRANCH, [REFERENCE_DATE, ...DATES]]
  );
  const hashes = files.map((f) => crypto.createHash("md5").update(f.file_data).digest("hex"));
  const allHashesMatch = hashes.length === 3 && new Set(hashes).size === 1;

  if (!allIdentical || !allHashesMatch) {
    console.error("\nABORT: dates no longer show the expected duplicate pattern. Re-investigate before deleting.", { allIdentical, allHashesMatch });
    process.exit(1);
  }

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(`delete from service_info_bp_snapshots where branch=$1 and date = any($2::date[])`, [BRANCH, DATES]);
  const delRaw = await client.query(`delete from raw_report_uploads where branch=$1 and report_type='service_info_bp' and date = any($2::date[])`, [BRANCH, DATES]);
  await client.query("commit");
  console.log(`\nCommitted. Deleted ${delSnap.rowCount} snapshot(s), ${delRaw.rowCount} raw upload record(s).`);

  const { rows: after } = await client.query(
    `select sum(wheel_balancing) wb, sum(wheel_alignment) wa, sum(brake_skimming) bs, sum(vas_revenue) vas from service_info_bp_snapshots where branch=$1 and date >= '2026-09-01'`,
    [BRANCH]
  );
  console.log("service_info_bp MTD sum after:", after[0]);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
