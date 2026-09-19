// Invoice ATM/26-27/009 (TR01B scrap bill, dated 17-Sep-2026) has two line
// items — CARTON BOX I (taxable 11,000.00) and CARTON BOX II (taxable
// 540.00) — for an invoice total taxable value of 11,540.00. The PDF
// auto-extraction (src/lib/bill/parse.ts) missed the second line item because
// this invoice's "Total:" summary row gets wrapped onto separate text lines
// by the PDF extractor, a layout none of the existing strategies recognized;
// it fell back to a heuristic that only picked up the first line item's
// taxable value (11,000.00). Fixed in src/lib/bill/parse.ts (fromTotalLabelBlock);
// this one-off script corrects the already-saved record.
import { Client } from "pg";
import "./load-env.mjs";

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const before = await client.query(
  `select invoice_number, taxable_value from bill_uploads where invoice_number = 'ATM/26-27/009'`
);
console.log("before:", before.rows);

await client.query(
  `update bill_uploads set taxable_value = 11540 where invoice_number = 'ATM/26-27/009'`
);

const after = await client.query(
  `select invoice_number, taxable_value from bill_uploads where invoice_number = 'ATM/26-27/009'`
);
console.log("after:", after.rows);

await client.end();
