import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ job_desc: string; job_code: string; em_flag: string; close_sa: string }>(
  `select row_data->>'Job Desc' as job_desc, row_data->>'Job Code' as job_code,
          row_data->>'EM Flag' as em_flag, row_data->>'Close Service Advisor Name' as close_sa
     from raw_upload_rows
     where report_type = 'service_info' and branch = 'TI01C' and date = '2026-10-06'
       and row_data->>'Job Order No' = 'GSJ2605170'`,
);
console.log(`${rows.length} lines for TI01C / 2026-10-06 / GSJ2605170:`);
for (const r of rows) console.log(r);

await pool.end();
