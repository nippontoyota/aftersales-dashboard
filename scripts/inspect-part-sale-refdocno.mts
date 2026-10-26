// Read-only: does Part Sale Report's RefDocNo/BillNo ever actually line up
// with an RO (Job Order No) from Service Info / SSRV089 / Labour Sales for
// the same branch+date, or is it strictly an invoice-to-invoice reference
// (as the parser's own doc comments assume)? Checked against real data
// instead of trusting the comments alone.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

// 1) What does RefDocNo/BillNo actually look like, format-wise?
const { rows: partSaleSample } = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows where report_type = 'part_sale' limit 300`,
);
console.log(`=== part_sale sample (${partSaleSample.length} rows) ===`);
const billNos = new Set<string>();
const refDocNos = new Set<string>();
for (const r of partSaleSample) {
  const b = String(r.row_data["BillNo"] ?? "").trim();
  const rd = String(r.row_data["RefDocNo"] ?? "").trim();
  if (b) billNos.add(b);
  if (rd) refDocNos.add(rd);
}
console.log("Sample BillNo values:", [...billNos].slice(0, 15));
console.log("Sample RefDocNo values (non-blank):", [...refDocNos].slice(0, 15));
console.log(`Distinct BillNo: ${billNos.size}, distinct non-blank RefDocNo: ${refDocNos.size} out of ${partSaleSample.length} rows`);

// 2) Pick one branch+date that has both part_sale and service_info/ssrv089 rows,
// and see whether any RefDocNo or BillNo value equals an actual Job Order No / JobOrder No / Invoice Doc No.
const { rows: candidateDates } = await pool.query<{ branch: string; date: string }>(
  `select ps.branch, ps.date::text as date
     from (select distinct branch, date from raw_upload_rows where report_type = 'part_sale') ps
     join (select distinct branch, date from raw_upload_rows where report_type = 'service_info') si
       on si.branch = ps.branch and si.date = ps.date
     order by ps.date desc
     limit 1`,
);
if (candidateDates.length === 0) {
  console.log("\nNo branch+date with both part_sale and service_info rows found.");
} else {
  const { branch, date } = candidateDates[0];
  console.log(`\n=== Checking overlap for ${branch} / ${date} ===`);

  const { rows: psRows } = await pool.query<{ row_data: Record<string, unknown> }>(
    `select row_data from raw_upload_rows where report_type = 'part_sale' and branch = $1 and date = $2`,
    [branch, date],
  );
  const psBillNos = new Set(psRows.map((r) => String(r.row_data["BillNo"] ?? "").trim()).filter(Boolean));
  const psRefDocNos = new Set(psRows.map((r) => String(r.row_data["RefDocNo"] ?? "").trim()).filter(Boolean));

  const { rows: siRows } = await pool.query<{ row_data: Record<string, unknown> }>(
    `select row_data from raw_upload_rows where report_type = 'service_info' and branch = $1 and date = $2`,
    [branch, date],
  );
  const siJobOrderNos = new Set(siRows.map((r) => String(r.row_data["Job Order No"] ?? "").trim()).filter(Boolean));
  const siTaxInvoiceNos = new Set(siRows.map((r) => String(r.row_data["Tax Invoice No."] ?? "").trim()).filter(Boolean));

  const { rows: ssrvRows } = await pool.query<{ row_data: Record<string, unknown> }>(
    `select row_data from raw_upload_rows where report_type = 'ssrv089' and branch = $1 and date = $2`,
    [branch, date],
  );
  const ssrvJobOrderNos = new Set(ssrvRows.map((r) => String(r.row_data["JobOrder No"] ?? "").trim()).filter(Boolean));
  const ssrvInvoiceDocNos = new Set(ssrvRows.map((r) => String(r.row_data["Invoice Doc No."] ?? "").trim()).filter(Boolean));

  console.log(`part_sale rows: ${psRows.length}, distinct BillNo: ${psBillNos.size}, distinct RefDocNo: ${psRefDocNos.size}`);
  console.log(`service_info rows: ${siRows.length}, distinct Job Order No: ${siJobOrderNos.size}, distinct Tax Invoice No.: ${siTaxInvoiceNos.size}`);
  console.log(`ssrv089 rows: ${ssrvRows.length}, distinct JobOrder No: ${ssrvJobOrderNos.size}, distinct Invoice Doc No.: ${ssrvInvoiceDocNos.size}`);

  const overlapCount = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length;
  console.log("\n--- Overlap checks ---");
  console.log(`BillNo ∩ Job Order No (SI):      ${overlapCount(psBillNos, siJobOrderNos)}`);
  console.log(`BillNo ∩ Tax Invoice No. (SI):   ${overlapCount(psBillNos, siTaxInvoiceNos)}`);
  console.log(`BillNo ∩ JobOrder No (SSRV):     ${overlapCount(psBillNos, ssrvJobOrderNos)}`);
  console.log(`BillNo ∩ Invoice Doc No. (SSRV): ${overlapCount(psBillNos, ssrvInvoiceDocNos)}`);
  console.log(`RefDocNo ∩ Job Order No (SI):      ${overlapCount(psRefDocNos, siJobOrderNos)}`);
  console.log(`RefDocNo ∩ Tax Invoice No. (SI):   ${overlapCount(psRefDocNos, siTaxInvoiceNos)}`);
  console.log(`RefDocNo ∩ JobOrder No (SSRV):     ${overlapCount(psRefDocNos, ssrvJobOrderNos)}`);
  console.log(`RefDocNo ∩ Invoice Doc No. (SSRV): ${overlapCount(psRefDocNos, ssrvInvoiceDocNos)}`);
}

await pool.end();
