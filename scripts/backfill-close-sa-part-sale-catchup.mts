// One-off backfill (2026-10-27, at the user's request): for every RO closed
// (i.e. with a Service Info/BP row) from FROM_DATE till today, across every
// branch, find every Part Sale date anywhere in that branch's history whose
// RefDocNo matches one of those ROs, and recompute close_sa_analytics_daily
// for each such date — the same catch-up catchUpPartSaleForClosedRos now
// does automatically on every new Service Info upload (see
// close-sa-analytics/recompute.ts), applied once here for the backlog that
// predates that fix.
//
// Usage: npx tsx scripts/backfill-close-sa-part-sale-catchup.mts [fromDate]
// fromDate defaults to 2026-07-01.
import "./load-env.mjs";
import { normalizeRo } from "../src/lib/close-sa-analytics/compute";
import { recomputeCloseSaAnalyticsForDates } from "../src/lib/close-sa-analytics/recompute";
import { pool } from "../src/lib/db";
import { loadPartSaleDatesForRos } from "../src/lib/raw-upload-rows/store";

const FROM_DATE = process.argv[2] ?? "2026-07-01";

async function main() {
  console.log(`Backfilling Close SA Analytics for ROs closed >= ${FROM_DATE}...`);

  const { rows: branchRows } = await pool.query<{ branch: string }>(
    `select distinct branch from raw_upload_rows
     where report_type in ('service_info', 'service_info_bp') and date >= $1`,
    [FROM_DATE]
  );
  const branches = branchRows.map((r) => r.branch).sort();
  console.log(`${branches.length} branches to check: ${branches.join(", ")}`);

  let totalDatesRecomputed = 0;
  for (const branch of branches) {
    const { rows: roRows } = await pool.query<{ ro: unknown }>(
      `select distinct row_data->>'Job Order No' as ro
       from raw_upload_rows
       where report_type in ('service_info', 'service_info_bp') and branch = $1 and date >= $2
         and row_data->>'Job Order No' <> ''`,
      [branch, FROM_DATE]
    );
    const normalizedRos = [...new Set(roRows.map((r) => normalizeRo(r.ro)).filter(Boolean))];
    if (normalizedRos.length === 0) continue;

    const dates = await loadPartSaleDatesForRos(branch, normalizedRos);
    console.log(`${branch}: ${normalizedRos.length} ROs closed since ${FROM_DATE} -> ${dates.length} Part Sale date(s) to recompute`);
    if (dates.length === 0) continue;

    await recomputeCloseSaAnalyticsForDates(branch, dates);
    totalDatesRecomputed += dates.length;
  }

  console.log(`Done. Recomputed ${totalDatesRecomputed} branch/date combos total.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
