// Opulent Auto Care Pvt Ltd is a vendor (parts bought from us for their own
// use), not a revenue-generating customer — its Part Sale Report rows should
// never have counted toward External Sales. Confirmed with the user
// 2026-09-12 after finding "Opulent" (spelled differently at every branch)
// as a CustomerName across 9 branches; only 6 of those have Opulent rows
// that actually land in September and match the External Sales criteria
// (bill type A + tracked part prefix) — see docs/data-reconciliation.md.
//
// Re-derives external_sales for every branch/date with a September Part
// Sale upload from the raw rows already on file (same match logic as
// src/lib/part-sale/parse.ts's isExternalSalesRow), excluding any row whose
// CustomerName contains "opulent" (case-insensitive, catches every spelling
// variant seen). Every other counted field (engine flush, injector cleaner,
// synthetic oil, brake cleaning spray, DIY count/revenue) is untouched —
// none of the flagged rows matched those categories.
//
//   node scripts/recompute-part-sale-external-excluding-opulent.mjs [--commit]
import { Client } from "pg";
import "./load-env.mjs";

const COMMIT = process.argv.includes("--commit");
const MONTH_START = "2026-09-01";
const MONTH_END = "2026-10-01";

const EXTERNAL_SALES_BILL_TYPE = "A";
const EXTERNAL_SALES_PART_PREFIXES = ["D", "L", "Z", "B", "T"];
const EXTERNAL_SALES_EXACT_PARTS = new Set([
  "A-9ADB1-01001",
  "A-9D101-00001", "A-9D102-00002", "A-9D103-00003", "A-9D104-00004",
  "A-9D105-00005", "A-9D106-00006", "A-9D107-00007", "A-9D108-00008",
  "A-9D109-00009", "A-9D110-00010", "A-9D111-00011", "A-9D112-00012",
]);
function normalize(v) { return String(v ?? "").trim(); }
function toAmount(v) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}
function isExternalSalesRow(billNo, partNo) {
  if (billNo.charAt(0).toUpperCase() !== EXTERNAL_SALES_BILL_TYPE) return false;
  if (EXTERNAL_SALES_EXACT_PARTS.has(partNo)) return true;
  return EXTERNAL_SALES_PART_PREFIXES.includes(partNo[0]);
}
function isOpulent(customerName) {
  return normalize(customerName).toLowerCase().includes("opulent");
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows: uploads } = await client.query(
    `select distinct branch, date::text from raw_upload_rows
       where report_type='part_sale' and date >= $1 and date < $2
       order by branch, date`,
    [MONTH_START, MONTH_END]
  );

  const changes = [];
  for (const { branch, date } of uploads) {
    const { rows } = await client.query(
      `select row_data->>'BillNo' as bill_no, row_data->>'PartNo' as part_no,
              row_data->>'NetAmnt' as net_amnt, row_data->>'CustomerName' as customer_name
         from raw_upload_rows where report_type='part_sale' and branch=$1 and date=$2`,
      [branch, date]
    );
    let externalSales = 0;
    let excludedAmount = 0;
    let excludedRows = 0;
    for (const r of rows) {
      const billNo = normalize(r.bill_no);
      const partNo = normalize(r.part_no);
      if (!isExternalSalesRow(billNo, partNo)) continue;
      const amount = toAmount(r.net_amnt);
      if (isOpulent(r.customer_name)) {
        excludedAmount += amount;
        excludedRows++;
        continue;
      }
      externalSales += amount;
    }
    if (excludedRows === 0) continue; // nothing to change for this branch/date

    const { rows: current } = await client.query(
      `select external_sales from part_sale_snapshots where branch=$1 and date=$2`,
      [branch, date]
    );
    const before = current[0] ? Number(current[0].external_sales) : null;
    changes.push({ branch, date, before, after: Math.round(externalSales * 100) / 100, excludedAmount: Math.round(excludedAmount * 100) / 100, excludedRows });
  }

  console.log("Branch/date external_sales changes (excluding Opulent rows):");
  for (const c of changes) {
    console.log(`  ${c.branch} ${c.date}: ${c.before} -> ${c.after}  (excluded ${c.excludedRows} row(s), Rs ${c.excludedAmount})`);
  }
  console.log(`\n${changes.length} snapshot(s) to update.`);

  if (!COMMIT) {
    console.log("\nDry run — re-run with --commit to apply.");
    process.exit(0);
  }

  await client.query("begin");
  for (const c of changes) {
    await client.query(`update part_sale_snapshots set external_sales=$3 where branch=$1 and date=$2`, [c.branch, c.date, c.after]);
  }
  await client.query("commit");
  console.log(`\nCommitted. Updated ${changes.length} snapshot(s).`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
