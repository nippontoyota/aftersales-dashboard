// Recurrence of the 2026-09-12 fix (fix-ti01c-sep11-duplicate-uploads.mjs):
// TI01C's scom205, SSRV089-General, and Service Info-GS uploads are byte-
// identical across 10, 11, AND 13 Sep (same row counts, same content hash,
// confirmed 2026-09-14) — the branch is resending the 10 Sep files instead
// of pulling fresh ones each round. BA Tool's own GUS/BPU RO show real
// growth the whole time (274->311->339 / 37->43->47), so the business is
// real; TI01C's own reports just aren't capturing it. Service Info / SSRV089
// sum every snapshot into MTD, so this is actively triple-counting 10 Sep's
// job orders/VAS entries right now.
//
// Deletes the 11 Sep AND 13 Sep snapshots + raw rows for all three report
// types, reverting both to "not yet uploaded" — correct until TI01C
// uploads real files for those rounds (12 Sep is a Saturday, folds into 13,
// so effectively they owe one real 11-13 Sep covering upload per type, same
// guidance already given for their BA-Tool-adjacent reports this round).
//
//   node scripts/fix-ti01c-sep11-13-duplicate-uploads.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01C";
const DATES = ["2026-09-11", "2026-09-13"];
const REFERENCE_DATE = "2026-09-10"; // the real, first-seen upload these duplicate

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: scom205 } = await client.query(
    `select date::text, source_file_name, gus_sp_rev_mtd, gus_lab_rev_mtd, bpu_sp_rev_mtd, bpu_lab_rev_mtd
       from scom205_snapshots where branch=$1 and date = any($2::date[]) order by date`,
    [BRANCH, [REFERENCE_DATE, ...DATES]]
  );
  const { rows: ssrv } = await client.query(
    `select date::text, source_file_name, accessories_part_sale, accessories_labour_sale
       from ssrv089_snapshots where branch=$1 and variant='general' and date = any($2::date[]) order by date`,
    [BRANCH, [REFERENCE_DATE, ...DATES]]
  );
  const { rows: si } = await client.query(
    `select date::text, source_file_name, wheel_balancing, wheel_alignment, brake_skimming, evaporator_cleaning, vas_revenue
       from service_info_snapshots where branch=$1 and date = any($2::date[]) order by date`,
    [BRANCH, [REFERENCE_DATE, ...DATES]]
  );
  console.log("scom205:", scom205);
  console.log("ssrv089-general:", ssrv);
  console.log("service_info:", si);

  // Safety check: every one of the three report types must show IDENTICAL
  // MTD-driving values across the reference date and both target dates —
  // otherwise one of them may have received a real upload since this was
  // last checked, and blind deletion would destroy real data.
  const allIdentical = (rows, key) => {
    const vals = new Set(rows.map((r) => JSON.stringify(key(r))));
    return vals.size === 1;
  };
  const scomOk = scom205.length === 3 && allIdentical(scom205, (r) => [r.gus_sp_rev_mtd, r.gus_lab_rev_mtd, r.bpu_sp_rev_mtd, r.bpu_lab_rev_mtd]);
  const ssrvOk = ssrv.length === 3 && allIdentical(ssrv, (r) => [r.accessories_part_sale, r.accessories_labour_sale]);
  const siOk = si.length === 3 && allIdentical(si, (r) => [r.wheel_balancing, r.wheel_alignment, r.brake_skimming, r.evaporator_cleaning, r.vas_revenue]);
  if (!scomOk || !ssrvOk || !siOk) {
    console.error("\nABORT: one or more report types no longer show the expected duplicate pattern. Re-investigate before deleting.", { scomOk, ssrvOk, siOk });
    process.exit(1);
  }

  const { rows: rawCounts } = await client.query(
    `select report_type, date::text, count(*) from raw_upload_rows where branch=$1 and date = any($2::date[]) and report_type in ('scom205','ssrv089','service_info') group by report_type, date order by report_type, date`,
    [BRANCH, DATES]
  );
  console.log("\nRaw rows to delete:", rawCounts);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delScom = await client.query(`delete from scom205_snapshots where branch=$1 and date = any($2::date[])`, [BRANCH, DATES]);
  const delSsrv = await client.query(`delete from ssrv089_snapshots where branch=$1 and variant='general' and date = any($2::date[])`, [BRANCH, DATES]);
  const delSi = await client.query(`delete from service_info_snapshots where branch=$1 and date = any($2::date[])`, [BRANCH, DATES]);
  const delRaw = await client.query(
    `delete from raw_upload_rows where branch=$1 and date = any($2::date[]) and report_type in ('scom205','ssrv089','service_info')`,
    [BRANCH, DATES]
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
