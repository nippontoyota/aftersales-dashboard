// Read-only inspection of the new inactive_customer_referrals table (added
// by the webhook receiver in src/app/api/webhooks/inactive-referral/route.ts)
// — columns, row count, sample row.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows: cols } = await pool.query(
  `select column_name, data_type, is_nullable, column_default
   from information_schema.columns
   where table_name = 'inactive_customer_referrals'
   order by ordinal_position`,
);
console.log("=== columns ===");
for (const c of cols) console.log(`  ${c.column_name.padEnd(30)} ${c.data_type}  nullable=${c.is_nullable}  default=${c.column_default ?? ""}`);

if (cols.length === 0) {
  console.log("(table does not exist)");
} else {
  const { rows: countRows } = await pool.query(`select count(*)::int as n from inactive_customer_referrals`);
  console.log(`\n=== row count: ${countRows[0].n} ===`);
  const { rows: sample } = await pool.query(`select * from inactive_customer_referrals order by id desc limit 5`);
  console.log("\n=== sample rows ===");
  console.log(JSON.stringify(sample, null, 2));
}

await pool.end();
