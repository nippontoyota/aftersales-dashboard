// Read-only inspection: every distinct column key seen across real ssrv089 /
// ssrv089_bp raw_upload_rows, how often each is actually non-blank, and one
// sample row per report type — answers "what else is in Cost & Sales Report
// beyond Close SA Name / Part Sale / Labour Sale / Brand" from real data
// instead of guessing.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

for (const reportType of ["ssrv089", "ssrv089_bp"]) {
  const { rows } = await pool.query<{ row_data: Record<string, unknown> }>(
    `select row_data from raw_upload_rows where report_type = $1 order by id desc limit 5000`,
    [reportType],
  );
  console.log(`\n=== ${reportType} — ${rows.length} rows sampled ===`);
  if (rows.length === 0) continue;

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
}

await pool.end();
