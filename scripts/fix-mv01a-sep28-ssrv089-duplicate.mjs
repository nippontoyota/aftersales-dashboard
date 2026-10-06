// MV01A's "28 Sep" SSRV089-General upload (source file "260926.csv") is a
// byte-identical resend of the 27 Sep upload (same filename, same 68 job
// orders, same amounts — verified 2026-09-30 by hashing both days' raw rows
// with the app's own hashRows()). It went through HQ's Upload Sheet, which
// at the time had no duplicate check for SSRV089 (see the fix landed
// alongside this script). Contributes zero new accessories deduction for
// the 28th — currently over-deducting Accessories by ~₹14,692 parts /
// ~₹1,984 labour for that day, since 27th's real business is being counted
// twice.
//
// Deletes the 28 Sep ssrv089 (general) snapshot + raw rows entirely,
// reverting MV01A to "not yet uploaded for the 28th" so the branch (or HQ)
// can submit the real file — the new duplicate/date-sanity checks on both
// upload routes will now catch a repeat of this specific mistake.
//
//   node scripts/fix-mv01a-sep28-ssrv089-duplicate.mjs [--commit]
import { createHash } from "crypto";
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "MV01A";
const DUPLICATE_DATE = "2026-09-28";
const ORIGINAL_DATE = "2026-09-27";

function hashRows(rows) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: dupRows } = await client.query(
    `select row_data from raw_upload_rows where report_type='ssrv089' and branch=$1 and date=$2 order by row_index`,
    [BRANCH, DUPLICATE_DATE]
  );
  const { rows: origRows } = await client.query(
    `select row_data from raw_upload_rows where report_type='ssrv089' and branch=$1 and date=$2 order by row_index`,
    [BRANCH, ORIGINAL_DATE]
  );

  if (dupRows.length === 0) {
    console.log(`No ssrv089 raw rows on file for ${BRANCH} ${DUPLICATE_DATE} — nothing to delete.`);
    process.exit(0);
  }
  if (origRows.length === 0) {
    console.error(`ABORT: no ssrv089 raw rows for ${BRANCH} ${ORIGINAL_DATE} to compare against — re-investigate.`);
    process.exit(1);
  }

  const dupHash = hashRows(dupRows.map((r) => r.row_data));
  const origHash = hashRows(origRows.map((r) => r.row_data));
  if (dupHash !== origHash) {
    console.error(`ABORT: ${DUPLICATE_DATE}'s rows no longer hash-match ${ORIGINAL_DATE}'s — this is no longer the same duplicate. Re-investigate.`);
    process.exit(1);
  }
  console.log(`Safety check passed: ${DUPLICATE_DATE}'s ${dupRows.length} rows are byte-identical to ${ORIGINAL_DATE}'s.`);

  const { rows: snap } = await client.query(
    `select accessories_part_sale, accessories_labour_sale, source_file_name from ssrv089_snapshots where branch=$1 and variant='general' and date=$2`,
    [BRANCH, DUPLICATE_DATE]
  );
  console.log(`${DUPLICATE_DATE} snapshot: source_file_name=${snap[0]?.source_file_name}, accessories_part_sale=${snap[0]?.accessories_part_sale}, accessories_labour_sale=${snap[0]?.accessories_labour_sale}`);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(`delete from ssrv089_snapshots where branch=$1 and variant='general' and date=$2`, [BRANCH, DUPLICATE_DATE]);
  const delRaw = await client.query(`delete from raw_upload_rows where branch=$1 and date=$2 and report_type='ssrv089'`, [BRANCH, DUPLICATE_DATE]);
  await client.query("commit");
  console.log(`\nCommitted. Deleted ${delSnap.rowCount} snapshot(s), ${delRaw.rowCount} raw row(s). MV01A can now upload a real ${DUPLICATE_DATE} SSRV089-General file.`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
