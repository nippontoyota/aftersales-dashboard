// TI01A's "09 Sep" Part Sale Report ("PART SALE 09-09-2026.csv", 108 rows)
// is a full, exact duplicate of rows already present in the "10 Sep" file
// ("PARTS & SALES 10-09-2026.csv") — every one of the 108 rows matches on
// BillNo, PartNo, NetAmnt, Sale Qty, VinNo, and CustomerName. Found while
// checking TI01A's External Sales reconciliation gap (unrelated — none of
// these 108 rows are external-type bills, so External Sales itself is
// unaffected; this only fixes engine flush/injector cleaner/synthetic
// oil/brake cleaning spray double-counting).
//
// Deletes the 09 Sep part_sale snapshot + raw rows entirely, reverting to
// "not yet uploaded for the 9th" — 10 Sep's snapshot remains the sole,
// correct holder of that data.
//
//   node scripts/fix-ti01a-sep09-part-sale-duplicate.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01A";
const REDUNDANT_DATE = "2026-09-09";
const CURRENT_DATE = "2026-09-10";

function sig(r) {
  return `${r.bill}|${r.part}|${r.net}|${r.qty}|${r.vin}|${r.cust}`;
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: redundantRows } = await client.query(
    `select row_data->>'BillNo' bill, row_data->>'PartNo' part, row_data->>'NetAmnt' net, row_data->>'Sale Qty' qty, row_data->>'VinNo' vin, row_data->>'CustomerName' cust
     from raw_upload_rows where report_type='part_sale' and branch=$1 and date=$2`,
    [BRANCH, REDUNDANT_DATE]
  );
  const { rows: currentRows } = await client.query(
    `select row_data->>'BillNo' bill, row_data->>'PartNo' part, row_data->>'NetAmnt' net, row_data->>'Sale Qty' qty, row_data->>'VinNo' vin, row_data->>'CustomerName' cust
     from raw_upload_rows where report_type='part_sale' and branch=$1 and date=$2`,
    [BRANCH, CURRENT_DATE]
  );
  const currentSigs = new Set(currentRows.map(sig));
  const notContained = redundantRows.filter((r) => !currentSigs.has(sig(r)));
  if (redundantRows.length === 0 || notContained.length > 0) {
    console.error(`\nABORT: 09 Sep is no longer fully contained in 10 Sep. Re-investigate.`, {
      redundantCount: redundantRows.length,
      notContainedCount: notContained.length,
    });
    process.exit(1);
  }
  console.log(`Safety check passed: all ${redundantRows.length} rows in the 09 Sep file are already in 10 Sep's.`);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  const delSnap = await client.query(`delete from part_sale_snapshots where branch=$1 and date=$2`, [BRANCH, REDUNDANT_DATE]);
  const delRaw = await client.query(
    `delete from raw_upload_rows where branch=$1 and date=$2 and report_type='part_sale'`,
    [BRANCH, REDUNDANT_DATE]
  );
  await client.query("commit");
  console.log(`\nCommitted. Deleted part_sale snapshot=${delSnap.rowCount}, ${delRaw.rowCount} raw row(s).`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
