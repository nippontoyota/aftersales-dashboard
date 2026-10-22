// Read-only: sample a few labour_sales rows with a non-zero "Over Target" to
// confirm the sign convention (actual sold hour vs standard target hour for
// that job code) against the user's own explanation.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows
     where report_type = 'labour_sales'
       and coalesce(row_data->>'Over Target', '0') <> '0'
     limit 20`,
);
console.log(`${rows.length} rows with non-zero Over Target`);
for (const r of rows) {
  const d = r.row_data;
  console.log(
    `JobCode=${d["Job Code"]}  Desc=${d["Job Desc."]}  SoldHour=${d["Sold Hour"]}  OverTarget=${d["Over Target"]}`,
  );
}
await pool.end();
