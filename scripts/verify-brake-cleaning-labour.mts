// Find a labour-side "brake cleaning" job code/desc, distinct from the
// Part Sale spray SKU we already track.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ job_code: string; job_desc: string; n: string }>(
  `select row_data->>'Job Code' as job_code, row_data->>'Job Desc' as job_desc, count(*) as n
     from raw_upload_rows
     where report_type in ('service_info', 'service_info_bp') and date >= '2026-10-01'
       and row_data->>'Job Desc' ilike '%brake%clean%'
     group by 1, 2 order by n desc limit 20`,
);
console.log("Service Info Job Desc matches for 'brake' + 'clean':", rows);

const { rows: lsRows } = await pool.query<{ job_code: string; job_desc: string; n: string }>(
  `select row_data->>'Job Code' as job_code, row_data->>'Job Desc.' as job_desc, count(*) as n
     from raw_upload_rows
     where report_type = 'labour_sales'
       and row_data->>'Job Desc.' ilike '%brake%clean%'
     group by 1, 2 order by n desc limit 20`,
);
console.log("\nLabour Sales Job Desc. matches for 'brake' + 'clean':", lsRows);

await pool.end();
