import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows
     where report_type = 'service_info' and branch = 'TI01C' and date = '2026-10-06'
       and row_data->>'Close Service Advisor Name' = 'Viswanath M R'
       and row_data->>'EM Flag' = 'EM60'`,
);
const byRo = new Map<string, Record<string, unknown>>();
for (const r of rows) {
  const ro = String(r.row_data["Job Order No"]);
  if (!byRo.has(ro)) byRo.set(ro, r.row_data);
}
for (const [ro, d] of byRo) {
  console.log({
    ro,
    jobOpenDate: d["Job Open Date"],
    jobOpenTime: d["Job Open Time"],
    invoiceDate: d["Invoice Date"],
    invoiceTime: d["Invoice Time"],
  });
}
await pool.end();
