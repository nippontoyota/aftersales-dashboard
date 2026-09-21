// TL01A's "20 Sep" Service Info-GS upload ("SIGS 18-20.xlsx") turned out to
// be a cumulative export covering Job Close Dates 18, 19, and 20 Sep (319
// rows: 96 + 185 + 38) — its 18th-portion is a byte-identical superset of
// the already-stored 18-Sep snapshot (all 96 rows match on Job Order No +
// Job Code + Job Desc), so leaving it as-is would double-count the 18th.
//
// At the user's request (2026-09-21): instead of stripping the 18th's rows
// out of the 20th's file, delete the 20 Sep snapshot + raw rows entirely,
// reverting to "not yet uploaded for the 20th" — the branch will re-upload.
// 18 Sep's own snapshot is untouched and remains the correct holder for
// that date; 19 Sep goes back to not-yet-uploaded (as it was before this
// cumulative file arrived).
//
//   node scripts/fix-tl01a-sep20-service-info-revert.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TL01A";
const TARGET_DATE = "2026-09-20";
const EXISTING_DATE = "2026-09-18";

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: targetRows } = await client.query(
    `select row_data->>'Job Order No' as jo, row_data->>'Job Code' as jc, row_data->>'Job Desc' as jd
     from raw_upload_rows where report_type='service_info' and branch=$1 and date=$2`,
    [BRANCH, TARGET_DATE]
  );
  const { rows: existingRows } = await client.query(
    `select row_data->>'Job Order No' as jo, row_data->>'Job Code' as jc, row_data->>'Job Desc' as jd
     from raw_upload_rows where report_type='service_info' and branch=$1 and date=$2`,
    [BRANCH, EXISTING_DATE]
  );
  const key = (r) => `${r.jo}|${r.jc}|${r.jd}`;
  const targetKeys = new Set(targetRows.map(key));
  const existingKeys = new Set(existingRows.map(key));
  const notContained = [...existingKeys].filter((k) => !targetKeys.has(k));

  console.log(`20 Sep file: ${targetRows.length} rows. 18 Sep snapshot: ${existingRows.length} rows.`);
  if (existingKeys.size === 0 || notContained.length > 0) {
    console.error("\nABORT: 18 Sep's rows are not fully contained in the 20 Sep file — re-investigate before deleting.", {
      existingCount: existingKeys.size,
      notContained,
    });
    process.exit(1);
  }
  console.log(`Safety check passed: all ${existingKeys.size} of 18 Sep's rows are present in the 20 Sep file (confirms it's a superset, safe to drop).`);

  const { rows: snap } = await client.query(
    `select wheel_balancing, wheel_alignment, brake_skimming, evaporator_cleaning, vas_revenue
     from service_info_snapshots where branch=$1 and date=$2`,
    [BRANCH, TARGET_DATE]
  );
  console.log("20 Sep snapshot to be deleted:", snap[0]);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(`delete from service_info_snapshots where branch=$1 and date=$2`, [BRANCH, TARGET_DATE]);
  const delRaw = await client.query(`delete from raw_upload_rows where report_type='service_info' and branch=$1 and date=$2`, [
    BRANCH,
    TARGET_DATE,
  ]);
  await client.query("commit");
  console.log(`\nCommitted. Deleted service_info_snapshots=${delSnap.rowCount}, raw rows=${delRaw.rowCount}.`);
  console.log("TL01A now shows 'not yet uploaded for the 20th' (and still owes the 19th) — ready for a fresh re-upload.");
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
