import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ date: string; branch: string; count: number }>(
  "select date::text as date, branch, count from total_car_care_treatments_daily order by branch, date"
);
console.log(rows.length, "rows total");

const mtd: Record<string, number> = {};
for (const r of rows) mtd[r.branch] = (mtd[r.branch] ?? 0) + Number(r.count);
for (const [branch, total] of Object.entries(mtd).sort()) console.log(branch, total);

const grandTotal = Object.values(mtd).reduce((a, b) => a + b, 0);
console.log("company-wide MTD total:", grandTotal);

await pool.end();
