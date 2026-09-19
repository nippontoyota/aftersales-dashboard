// TI01A's newly-uploaded "02 Sep" Part Sale Report (SPRT014_PartSaleReport-
// TI01A.csv, 1,016 rows) turned out to be almost entirely redundant: 1,010
// of its 1,016 rows are exact duplicates (BillNo/PartNo/NetAmnt/Sale Qty/
// VinNo/CustomerName) of rows already in the "03 Sep" file (SPRT014_Part
// SaleReport-1788498238765_1.csv, 1,652 rows), which the user confirmed was
// already a multi-day (1st-3rd) cumulative export. Only 6 rows in the 02
// Sep file are genuinely new — 1 of those is an `A`-type external bill
// (+₹114.95), the other 5 don't match any tracked part category (engine
// flush/injector cleaner/synthetic oil/brake cleaning spray/DIY).
//
// Moves those 6 unique raw rows onto 03 Sep (the correct cumulative holder),
// bumps 03 Sep's external_sales by the ₹114.95 they add, and deletes the 02
// Sep snapshot + all 1,016 raw rows entirely — reverting 02 Sep to "not yet
// uploaded" rather than leaving a mostly-redundant duplicate.
//
//   node scripts/fix-ti01a-sep02-part-sale-cumulative.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "TI01A";
const REDUNDANT_DATE = "2026-09-02";
const CURRENT_DATE = "2026-09-03";

function sig(r) {
  return `${r.bill}|${r.part}|${r.net}|${r.qty}|${r.vin}|${r.cust}`;
}
function isExternal(bill, refDoc) {
  const t = (bill || "").charAt(0).toUpperCase();
  if (t === "A") return true;
  if (t === "F") return (refDoc || "").charAt(0).toUpperCase() === "A";
  return false;
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: redundantRows } = await client.query(
    `select id, row_data->>'BillNo' bill, row_data->>'PartNo' part, row_data->>'NetAmnt' net, row_data->>'Sale Qty' qty,
            row_data->>'VinNo' vin, row_data->>'CustomerName' cust, row_data->>'RefDocNo' refdoc
     from raw_upload_rows where report_type='part_sale' and branch=$1 and date=$2`,
    [BRANCH, REDUNDANT_DATE]
  );
  const { rows: currentRows } = await client.query(
    `select row_data->>'BillNo' bill, row_data->>'PartNo' part, row_data->>'NetAmnt' net, row_data->>'Sale Qty' qty,
            row_data->>'VinNo' vin, row_data->>'CustomerName' cust
     from raw_upload_rows where report_type='part_sale' and branch=$1 and date=$2`,
    [BRANCH, CURRENT_DATE]
  );
  const currentSigs = new Set(currentRows.map(sig));
  const uniqueRows = redundantRows.filter((r) => !currentSigs.has(sig(r)));

  if (redundantRows.length !== 1016 || uniqueRows.length !== 6) {
    console.error(`\nABORT: expected 1016 rows with exactly 6 unique, got ${redundantRows.length} rows / ${uniqueRows.length} unique. Re-investigate.`);
    process.exit(1);
  }
  const extBump = uniqueRows.filter((r) => isExternal(r.bill, r.refdoc)).reduce((a, r) => a + Number(r.net), 0);
  console.log(`Safety check passed: 1016 rows, 6 unique, external bump = ₹${extBump}`);
  console.log("Unique rows:", uniqueRows.map((r) => `${r.bill}|${r.part}|${r.net}`));

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");

  // Move the 6 unique rows onto 03 Sep.
  for (const r of uniqueRows) {
    await client.query(`update raw_upload_rows set date=$1 where id=$2`, [CURRENT_DATE, r.id]);
  }

  const { rows: snap } = await client.query(
    `select external_sales from part_sale_snapshots where branch=$1 and date=$2`,
    [BRANCH, CURRENT_DATE]
  );
  const newExternal = Number(snap[0].external_sales) + extBump;
  await client.query(`update part_sale_snapshots set external_sales=$3 where branch=$1 and date=$2`, [BRANCH, CURRENT_DATE, newExternal]);

  const delSnap = await client.query(`delete from part_sale_snapshots where branch=$1 and date=$2`, [BRANCH, REDUNDANT_DATE]);
  const delRaw = await client.query(`delete from raw_upload_rows where branch=$1 and date=$2 and report_type='part_sale'`, [BRANCH, REDUNDANT_DATE]);

  await client.query("commit");
  console.log(`\nCommitted. 03 Sep external_sales -> ${newExternal}. Deleted 02 Sep snapshot=${delSnap.rowCount}, ${delRaw.rowCount} remaining raw row(s).`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
