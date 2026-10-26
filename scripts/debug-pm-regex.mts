import "./load-env.mjs";
import { pool } from "../src/lib/db";

const PM_JOB_DESC_PATTERN = /^(?:\d{1,3}(?:,\d{2,3})*\s*KM SERVICE|Vcare - )/i;

// Every distinct Job Desc for Akhil Ashok's ROs this month, to see which
// ones SHOULD be PM but aren't matching.
const { rows } = await pool.query<{ job_desc: string; n: string }>(
  `select row_data->>'Job Desc' as job_desc, count(*) as n
     from raw_upload_rows
     where report_type = 'service_info' and branch = 'CO01A' and date >= '2026-10-01' and date <= '2026-10-22'
       and row_data->>'Close Service Advisor Name' = 'Akhil Ashok'
     group by 1 order by n desc`,
);
console.log(`${rows.length} distinct Job Desc for Akhil Ashok, Oct 1-22:`);
for (const r of rows) {
  const matches = PM_JOB_DESC_PATTERN.test(r.job_desc);
  if (matches || /KM SERVICE|Vcare/i.test(r.job_desc)) {
    console.log(`${matches ? "MATCH" : "NO-MATCH"}  "${r.job_desc}"  x${r.n}`);
  }
}

await pool.end();
