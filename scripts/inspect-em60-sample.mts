// Read-only, small sample only (per the user's instruction): what does
// "EM Flag" actually contain in real Service Info rows, is there anything
// that looks like "EM60" specifically, and does a Periodic Maintenance job
// carry Job Open/Close or Invoice time fields we could use for an on-time
// delivery check against a 60-min target.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

// 1) Distinct EM Flag values, small sample.
const { rows: emVals } = await pool.query<{ v: string; n: string }>(
  `select row_data->>'EM Flag' as v, count(*) as n
     from raw_upload_rows where report_type = 'service_info' and date >= '2026-10-01'
     group by 1 order by 2 desc limit 10`,
);
console.log("=== Distinct EM Flag values (Oct 2026) ===");
console.log(emVals);

// 2) Any column whose name or value mentions "EM60" or "60" near "min"/"EM".
const { rows: em60 } = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows
     where report_type = 'service_info' and date >= '2026-10-01'
       and row_data::text ilike '%EM60%'
     limit 3`,
);
console.log(`\n=== Rows mentioning "EM60" anywhere: ${em60.length} ===`);
for (const r of em60) console.log(JSON.stringify(r.row_data));

// 3) Sample rows where EM Flag = Y, one branch/date, to see Job Desc + open/close/invoice fields together.
const { rows: sample } = await pool.query<{ branch: string; date: string }>(
  `select branch, date::text as date from raw_upload_rows
     where report_type = 'service_info' and date >= '2026-10-01' and row_data->>'EM Flag' = 'Y'
     limit 1`,
);
console.log("\n=== Sample branch/date with EM Flag = Y ===", sample);

if (sample.length > 0) {
  const { branch, date } = sample[0];
  const { rows: emRows } = await pool.query<{ row_data: Record<string, unknown> }>(
    `select row_data from raw_upload_rows
       where report_type = 'service_info' and branch = $1 and date = $2 and row_data->>'EM Flag' = 'Y'
       limit 5`,
    [branch, date],
  );
  console.log(`\n=== ${emRows.length} EM Flag=Y rows for ${branch}/${date} ===`);
  for (const r of emRows) {
    const d = r.row_data;
    console.log({
      JobDesc: d["Job Desc"],
      JobCode: d["Job Code"],
      EMFlag: d["EM Flag"],
      JobOpenDate: d["Job Open Date"],
      JobOpenTime: d["Job Open Time"],
      JobCloseDate: d["Job Close Date"],
      JobCloseTime: d["Job Close Time"],
      InvoiceDate: d["Invoice Date"],
      InvoiceTime: d["Invoice Time"],
      CloseSA: d["Close Service Advisor Name"],
    });
  }
}

await pool.end();
