import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ month: string; n: string; branches: string }>(
  `select to_char(date, 'YYYY-MM') as month, count(distinct date) as n, count(distinct branch) as branches
     from raw_upload_rows where report_type = 'labour_sales'
     group by 1 order by 1`,
);
console.log(rows);
await pool.end();
