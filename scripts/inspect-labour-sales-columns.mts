// Read-only inspection: every distinct column key seen across real
// labour_sales raw_upload_rows, how often each is non-blank, and a sample row.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows where report_type = 'labour_sales' limit 200`,
);
console.log(`=== labour_sales — ${rows.length} rows sampled ===`);
if (rows.length > 0) {
  const nonBlankCount = new Map<string, number>();
  const total = rows.length;
  for (const r of rows) {
    for (const [key, value] of Object.entries(r.row_data ?? {})) {
      const isBlank = value === null || value === undefined || String(value).trim() === "";
      nonBlankCount.set(key, (nonBlankCount.get(key) ?? 0) + (isBlank ? 0 : 1));
    }
  }
  const sortedKeys = [...nonBlankCount.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, count] of sortedKeys) {
    console.log(`  ${key.padEnd(30)} non-blank in ${count}/${total} (${((count / total) * 100).toFixed(0)}%)`);
  }
  console.log(`\n  --- sample row ---`);
  console.log(JSON.stringify(rows[0].row_data, null, 2));
} else {
  console.log("No labour_sales rows found at all.");
}

await pool.end();
