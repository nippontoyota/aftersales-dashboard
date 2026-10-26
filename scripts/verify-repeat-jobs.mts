// Small sample: how often does the same vehicle (Vin no) get the same Job
// Code done twice within the same month, at the same branch — to gauge
// whether "same car same work repeat" is rare/notable or common/noisy.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ branch: string; vin: string; job_code: string; job_desc: string; n: string; dates: string[] }>(
  `select branch, row_data->>'Vin no' as vin, row_data->>'Job Code' as job_code, row_data->>'Job Desc' as job_desc,
          count(distinct row_data->>'Job Order No') as n, array_agg(distinct date::text) as dates
     from raw_upload_rows
     where report_type = 'service_info' and branch = 'CO01A' and date >= '2026-10-01' and date <= '2026-10-22'
       and row_data->>'Vin no' <> ''
     group by 1, 2, 3, 4
     having count(distinct row_data->>'Job Order No') > 1
     order by n desc
     limit 20`,
);
console.log(`${rows.length} (vin, job code) pairs with >1 distinct RO this month, CO01A Oct 1-22:`);
for (const r of rows) console.log(r);

await pool.end();
