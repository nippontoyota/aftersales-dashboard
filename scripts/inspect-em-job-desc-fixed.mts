// Corrected version — RO numbers are NOT globally unique across branches
// (confirmed: "GSJ2605170" alone matched 13 different branches' own ROs on
// different dates), so every lookup here is scoped by (branch, date, RO)
// together, never RO alone.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows: sampleRos } = await pool.query<{ ro: string; branch: string; date: string; flag: string }>(
  `select distinct row_data->>'Job Order No' as ro, branch, date::text as date, row_data->>'EM Flag' as flag
     from raw_upload_rows
     where report_type = 'service_info' and date >= '2026-10-01'
       and row_data->>'EM Flag' in ('EM60', 'EM90', 'EM120')
     limit 5`,
);

for (const { ro, branch, date, flag } of sampleRos) {
  const { rows: lines } = await pool.query<{ job_desc: string; job_code: string }>(
    `select row_data->>'Job Desc' as job_desc, row_data->>'Job Code' as job_code
       from raw_upload_rows
       where report_type = 'service_info' and branch = $1 and date = $2 and row_data->>'Job Order No' = $3`,
    [branch, date, ro],
  );
  const hasPmLine = lines.some((l) => /^\d+(,\d+)*\s*KM SERVICE/i.test(String(l.job_desc ?? "")) || /^Vcare - /i.test(String(l.job_desc ?? "")));
  console.log(`\nRO ${ro} (${branch}, ${date}, ${flag}) — ${lines.length} lines, has PM line: ${hasPmLine}`);
  for (const l of lines) console.log(`  ${l.job_code}  "${l.job_desc}"`);
}

await pool.end();
