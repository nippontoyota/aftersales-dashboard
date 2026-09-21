// IR01A's "17 Sep" Part Sale Report ("SPRT014_PartSaleReport-17 SEP 2026_1.csv",
// 101 rows) is not really 17 Sep data at all — every one of its rows carries
// SaleDate 18/09/2026, and all 101 are byte-identical (BillNo, PartNo,
// NetAmnt, Sale Qty, VinNo) to rows already present in the "18 Sep" file
// ("SPRT014_PartSaleReport-SEP 2026_1.csv", 321 rows, also 100% SaleDate
// 18/09/2026). So the "17 Sep" upload was a partial early pull of the 18th's
// business day, mislabeled — the real, complete 18th file already contains
// everything in it. Found investigating a Revenue Stream reconciliation diff
// (dashboard vs vendor External Sales, 20 Sep).
//
// Deletes the 17 Sep part_sale snapshot + raw rows entirely, reverting IR01A
// to "not yet uploaded for the 17th" (genuinely true — none of that data was
// ever the 17th's) — 18 Sep's snapshot remains the sole, correct holder.
//
//   node scripts/fix-ir01a-sep17-part-sale-duplicate.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "IR01A";
const REDUNDANT_DATE = "2026-09-17";
const CURRENT_DATE = "2026-09-18";

function sig(r) {
  return `${r.bill}|${r.part}|${r.net}|${r.qty}|${r.vin}`;
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: redundantRows } = await client.query(
    `select row_data->>'BillNo' bill, row_data->>'PartNo' part, row_data->>'NetAmnt' net, row_data->>'Sale Qty' qty, row_data->>'VinNo' vin, row_data->>'SaleDate' saledate
     from raw_upload_rows where report_type='part_sale' and branch=$1 and date=$2`,
    [BRANCH, REDUNDANT_DATE]
  );
  const { rows: currentRows } = await client.query(
    `select row_data->>'BillNo' bill, row_data->>'PartNo' part, row_data->>'NetAmnt' net, row_data->>'Sale Qty' qty, row_data->>'VinNo' vin
     from raw_upload_rows where report_type='part_sale' and branch=$1 and date=$2`,
    [BRANCH, CURRENT_DATE]
  );
  const currentSigs = new Set(currentRows.map(sig));
  const notContained = redundantRows.filter((r) => !currentSigs.has(sig(r)));
  const notSep18 = redundantRows.filter((r) => r.saledate !== "18/09/2026");
  if (redundantRows.length === 0 || notContained.length > 0 || notSep18.length > 0) {
    console.error(`\nABORT: 17 Sep is no longer fully contained in 18 Sep, or its SaleDate isn't uniformly 18/09/2026. Re-investigate.`, {
      redundantCount: redundantRows.length,
      notContainedCount: notContained.length,
      notSep18Count: notSep18.length,
    });
    process.exit(1);
  }
  console.log(`Safety check passed: all ${redundantRows.length} rows in the 17 Sep file are already in 18 Sep's, and all are SaleDate 18/09/2026.`);

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
