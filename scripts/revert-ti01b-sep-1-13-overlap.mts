// Reverts the backfill-ti01b-sep-1-13-gap.mts insert — turned out to double-
// count. The pre-existing 2026-09-15 ssrv089/part_sale/ssrv089_bp snapshots
// (uploaded 2026-09-16, untouched since, nothing to do with today's work)
// are themselves cumulative exports that already fully contain the 1-13
// (ssrv089/BP) / 1-14 (Part Sale) span — confirmed by exact JobOrder No /
// BillNo containment (100% of the newly-inserted rows' keys already present
// in the 15th's rows). So the 1-13/1-14 gap was never actually missing from
// the MTD total; re-adding it under its own date double-counted that span.
//
//   npx tsx scripts/revert-ti01b-sep-1-13-overlap.mts [--commit]
import "./load-env.mjs";
import { pool } from "../src/lib/db.ts";
import { logDeletedRows } from "../src/lib/audit/deleted-rows-log.ts";
import { recomputeAfterSsrv089Upload } from "../src/lib/cancellation/adjustment-recompute.ts";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01B";
const SOURCE = "revert-ti01b-sep-1-13-overlap.mts";
const GS_DATE = "2026-09-13";
const PART_SALE_DATE = "2026-09-14";

console.log(`=== Revert TI01B 1-13/1-14 overlap — ${COMMIT ? "COMMIT" : "DRY RUN"} ===\n`);

const ssrv = await pool.query(`select * from ssrv089_snapshots where branch=$1 and variant='general' and date=$2`, [BRANCH, GS_DATE]);
console.log(`ssrv089_snapshots to remove (${GS_DATE}):`, ssrv.rows);
const ps = await pool.query(`select * from part_sale_snapshots where branch=$1 and date=$2`, [BRANCH, PART_SALE_DATE]);
console.log(`part_sale_snapshots to remove (${PART_SALE_DATE}):`, ps.rows);
const bpGrey = await pool.query(`select * from ssrv089_bp_grey_snapshots where branch=$1 and date=$2`, [BRANCH, GS_DATE]);
console.log(`ssrv089_bp_grey_snapshots to remove (${GS_DATE}):`, bpGrey.rows);
const bpRaw = await pool.query(`select date::text, report_type, source_file_name from raw_report_uploads where branch=$1 and report_type='ssrv089_bp' and date=$2`, [BRANCH, GS_DATE]);
console.log(`raw_report_uploads to remove (${GS_DATE}):`, bpRaw.rows);

if (!COMMIT) {
  console.log("\nDry run — re-run with --commit to write.");
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query("begin");

  await logDeletedRows(client, "ssrv089_snapshots", SOURCE, "branch=$1 and variant='general' and date=$2", [BRANCH, GS_DATE]);
  await client.query(`delete from ssrv089_snapshots where branch=$1 and variant='general' and date=$2`, [BRANCH, GS_DATE]);

  await logDeletedRows(client, "raw_upload_rows", SOURCE, "branch=$1 and report_type='ssrv089' and date=$2", [BRANCH, GS_DATE]);
  await client.query(`delete from raw_upload_rows where branch=$1 and report_type='ssrv089' and date=$2`, [BRANCH, GS_DATE]);

  await logDeletedRows(client, "part_sale_snapshots", SOURCE, "branch=$1 and date=$2", [BRANCH, PART_SALE_DATE]);
  await client.query(`delete from part_sale_snapshots where branch=$1 and date=$2`, [BRANCH, PART_SALE_DATE]);

  await logDeletedRows(client, "raw_upload_rows", SOURCE, "branch=$1 and report_type='part_sale' and date=$2", [BRANCH, PART_SALE_DATE]);
  await client.query(`delete from raw_upload_rows where branch=$1 and report_type='part_sale' and date=$2`, [BRANCH, PART_SALE_DATE]);

  await logDeletedRows(client, "raw_report_uploads", SOURCE, "branch=$1 and report_type='ssrv089_bp' and date=$2", [BRANCH, GS_DATE]);
  await client.query(`delete from raw_report_uploads where branch=$1 and report_type='ssrv089_bp' and date=$2`, [BRANCH, GS_DATE]);

  // ssrv089_bp_grey_snapshots isn't in AUDITABLE_TABLES (only ever carries
  // an all-zero total for a non-grey-eligible branch like TI01B, so there's
  // nothing worth snapshotting) — plain delete.
  await client.query(`delete from ssrv089_bp_grey_snapshots where branch=$1 and date=$2`, [BRANCH, GS_DATE]);

  await client.query("commit");
} catch (err) {
  await client.query("rollback");
  throw err;
} finally {
  client.release();
}

await recomputeAfterSsrv089Upload(BRANCH, GS_DATE);
console.log("\nReverted and recomputed.");
await pool.end();
