import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ branch: string; date: string }>(
  `select distinct branch, date::text as date from raw_upload_rows
     where report_type = 'service_info' and row_data->>'Job Order No' = 'GSJ2605170'`,
);
console.log(rows);
await pool.end();
