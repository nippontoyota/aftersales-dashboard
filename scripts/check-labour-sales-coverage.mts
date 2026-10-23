import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ min_date: string; max_date: string; n: string }>(
  `select min(date)::text as min_date, max(date)::text as max_date, count(distinct date) as n from raw_upload_rows where report_type = 'labour_sales'`,
);
console.log("labour_sales date range:", rows[0]);

const { rows: sept } = await pool.query<{ date: string; n: string }>(
  `select date::text as date, count(*) as n from raw_upload_rows where report_type = 'labour_sales' and date >= '2026-09-01' and date <= '2026-09-30' group by date order by date`,
);
console.log(`\nSeptember 2026 labour_sales rows: ${sept.length} distinct dates`);
console.log(sept);

const { rows: sept2 } = await pool.query<{ branch: string; date: string; n: string }>(
  `select branch, date::text as date, count(*) as n from close_sa_analytics_daily where date >= '2026-09-01' and date <= '2026-09-30' and labour_revenue_after > 0 limit 5`,
);
console.log(`\nSept close_sa_analytics_daily rows with labour_revenue_after > 0: ${sept2.length}`);
console.log(sept2);

await pool.end();
