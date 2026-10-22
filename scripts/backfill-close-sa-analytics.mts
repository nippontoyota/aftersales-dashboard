// Backfills close_sa_analytics_daily for every branch/date that has Service
// Info (GS or BP) rows on file — Labour Sales/Part Sale are joined in by the
// recompute itself, so this only needs to iterate the Service Info side.
import "./load-env.mjs";
import { recomputeCloseSaAnalytics } from "../src/lib/close-sa-analytics/recompute";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ branch: string; date: string }>(
  `select distinct branch, date::text as date from raw_upload_rows where report_type in ('service_info', 'service_info_bp') order by date, branch`,
);
console.log(`${rows.length} branch/date combos to recompute.`);

let done = 0;
for (const { branch, date } of rows) {
  await recomputeCloseSaAnalytics(branch, date);
  done++;
  if (done % 25 === 0 || done === rows.length) console.log(`  ${done}/${rows.length} done (${branch} ${date})`);
}

console.log("Backfill complete.");
await pool.end();
