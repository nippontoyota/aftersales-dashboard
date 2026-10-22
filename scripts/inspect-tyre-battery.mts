// Read-only: find how a tyre/battery sale actually shows up in real data —
// Part Sale Report's full column set (beyond PartNo/Sale Qty/etc. already
// used), and any row whose PartNo or a description-like column mentions
// TYRE/TIRE/BATTERY, to find real SKU patterns before writing a match rule.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows where report_type = 'part_sale' limit 500`,
);
console.log(`=== part_sale columns (${rows.length} rows sampled) ===`);
const keys = new Set<string>();
for (const r of rows) for (const k of Object.keys(r.row_data ?? {})) keys.add(k);
console.log([...keys].sort());

console.log(`\n=== rows whose PartNo or any text column mentions TYRE/TIRE/BATTERY ===`);
const { rows: hits } = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows
     where report_type = 'part_sale'
       and (row_data::text ilike '%tyre%' or row_data::text ilike '%tire%' or row_data::text ilike '%battery%')
     limit 15`,
);
for (const h of hits) console.log(JSON.stringify(h.row_data));

console.log(`\n=== same check against service_info Job Desc ===`);
const { rows: siHits } = await pool.query<{ job_desc: string; job_code: string; n: string }>(
  `select row_data->>'Job Desc' as job_desc, row_data->>'Job Code' as job_code, count(*) as n
     from raw_upload_rows
     where report_type = 'service_info'
       and (row_data->>'Job Desc' ilike '%tyre%' or row_data->>'Job Desc' ilike '%tire%' or row_data->>'Job Desc' ilike '%battery%')
     group by 1, 2 order by n desc limit 30`,
);
for (const h of siHits) console.log(`${h.job_code}  "${h.job_desc}"  x${h.n}`);

await pool.end();
