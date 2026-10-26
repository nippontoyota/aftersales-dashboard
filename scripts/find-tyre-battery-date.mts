import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ branch: string; date: string; n: string }>(
  `select branch, date::text as date, count(*) as n
     from raw_upload_rows
     where report_type = 'part_sale'
       and (row_data->>'PartNo' ilike 'T-%' or row_data->>'PartNo' ilike 'B-%')
     group by branch, date order by date desc limit 10`,
);
console.log(rows);
await pool.end();
