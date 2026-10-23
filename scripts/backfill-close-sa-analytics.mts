// Backfills close_sa_analytics_daily for every branch/date that has Service
// Info (GS or BP) rows on file from BACKFILL_FROM_DATE onwards (at the
// user's request, 2026-10-22 — the full-history backfill wasn't needed) —
// Labour Sales/Part Sale are joined in by the recompute itself, so this only
// needs to iterate the Service Info side.
import "./load-env.mjs";
import { recomputeCloseSaAnalytics } from "../src/lib/close-sa-analytics/recompute";
import { pool } from "../src/lib/db";

const BACKFILL_FROM_DATE = process.argv[2] ?? "2026-07-01";

const { rows } = await pool.query<{ branch: string; date: string }>(
  `select distinct branch, date::text as date from raw_upload_rows
     where report_type in ('service_info', 'service_info_bp') and date >= $1
     order by date, branch`,
  [BACKFILL_FROM_DATE],
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
