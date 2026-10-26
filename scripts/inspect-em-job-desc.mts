// Confirms whether EM60/EM90/EM120 only ever appears on Periodic
// Maintenance job rows, or on other job types too — small sample, October
// 2026 only.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ job_desc: string; job_code: string; em_flag: string; n: string }>(
  `select row_data->>'Job Desc' as job_desc, row_data->>'Job Code' as job_code, row_data->>'EM Flag' as em_flag, count(*) as n
     from raw_upload_rows
     where report_type = 'service_info' and date >= '2026-10-01'
       and row_data->>'EM Flag' in ('EM60', 'EM90', 'EM120')
     group by 1, 2, 3
     order by n desc
     limit 40`,
);
console.log(`${rows.length} distinct (Job Desc, Job Code, EM Flag) combos`);
for (const r of rows) console.log(`${r.em_flag}  ${r.job_code}  "${r.job_desc}"  x${r.n}`);

// Also: of all EM60/90/120 ROs, does every one have a PM-shaped Job Desc
// SOMEWHERE among its own lines (since EM Flag is RO-level, repeated across
// every line of that RO, including add-ons) — check a handful of full ROs.
const { rows: sampleRos } = await pool.query<{ ro: string }>(
  `select distinct row_data->>'Job Order No' as ro
     from raw_upload_rows
     where report_type = 'service_info' and date >= '2026-10-01'
       and row_data->>'EM Flag' in ('EM60', 'EM90', 'EM120')
     limit 5`,
);
for (const { ro } of sampleRos) {
  const { rows: lines } = await pool.query<{ job_desc: string; job_code: string }>(
    `select row_data->>'Job Desc' as job_desc, row_data->>'Job Code' as job_code
       from raw_upload_rows
       where report_type = 'service_info' and row_data->>'Job Order No' = $1
       limit 10`,
    [ro],
  );
  console.log(`\nRO ${ro} — all lines:`);
  for (const l of lines) console.log(`  ${l.job_code}  "${l.job_desc}"`);
}

await pool.end();
