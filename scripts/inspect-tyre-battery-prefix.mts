// Read-only: confirm PartNo prefixes "T-" (tyre) and "B-" (battery) are real
// and look like what they're claimed to be, before wiring them into
// close-sa-analytics/compute.ts.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

for (const prefix of ["T-", "B-"]) {
  const { rows } = await pool.query<{ row_data: Record<string, unknown> }>(
    `select row_data from raw_upload_rows
       where report_type = 'part_sale' and row_data->>'PartNo' ilike $1
       limit 15`,
    [`${prefix}%`],
  );
  console.log(`\n=== PartNo starting "${prefix}" — ${rows.length} sample rows ===`);
  for (const r of rows) {
    const d = r.row_data;
    console.log(`${d["PartNo"]}  "${d["Part Name"] ?? d["Part Desc."]}"  qty=${d["Sale Qty"]}  net=${d["NetAmnt"]}  ref=${d["RefDocNo"]}`);
  }

  const { rows: countRow } = await pool.query<{ n: string }>(
    `select count(*) as n from raw_upload_rows where report_type = 'part_sale' and row_data->>'PartNo' ilike $1`,
    [`${prefix}%`],
  );
  console.log(`Total rows with PartNo starting "${prefix}": ${countRow[0].n}`);
}

await pool.end();
