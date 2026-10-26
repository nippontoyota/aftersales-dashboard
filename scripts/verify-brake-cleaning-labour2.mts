import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ job_code: string; job_desc: string; n: string }>(
  `select row_data->>'Job Code' as job_code, row_data->>'Job Desc.' as job_desc, count(*) as n
     from raw_upload_rows
     where report_type = 'labour_sales' and row_data->>'Job Desc.' ilike '%brake%'
     group by 1, 2 order by n desc limit 30`,
);
console.log("Labour Sales — every 'brake' Job Desc.:", rows);

const { rows: siRows } = await pool.query<{ job_code: string; job_desc: string; n: string }>(
  `select row_data->>'Job Code' as job_code, row_data->>'Job Desc' as job_desc, count(*) as n
     from raw_upload_rows
     where report_type = 'service_info' and date >= '2026-10-01' and row_data->>'Job Desc' ilike '%brake%'
     group by 1, 2 order by n desc limit 30`,
);
console.log("\nService Info — every 'brake' Job Desc:", siRows);

await pool.end();
