// One-off backfill (2026-10-28, at the user's request): re-recomputes
// close_sa_analytics_daily for every branch/date that has a Service Info
// (GS or BP) upload from FROM_DATE till today, under the new tyre/battery
// logic — keyed to the day the RO closed, not the day the part was billed
// (see close-sa-analytics/compute.ts's partSaleRowsForTyreBattery doc
// comment). Every other metric is recomputed identically either way, so
// this is a safe full re-run, not a selective patch.
//
// Usage: npx tsx scripts/backfill-close-sa-tyre-battery-ro-close-date.mts [fromDate]
// fromDate defaults to 2026-07-01.
import "./load-env.mjs";
import { recomputeCloseSaAnalyticsForDates } from "../src/lib/close-sa-analytics/recompute";
import { pool } from "../src/lib/db";

const FROM_DATE = process.argv[2] ?? "2026-07-01";

async function main() {
  console.log(`Backfilling Close SA Analytics (RO-close-date tyre/battery) for Service Info dates >= ${FROM_DATE}...`);

  const { rows } = await pool.query<{ branch: string; date: string }>(
    `select branch, date::text as date from (
       select distinct branch, date from raw_upload_rows
       where report_type in ('service_info', 'service_info_bp') and date >= $1
     ) x order by branch, date`,
    [FROM_DATE]
  );

  const byBranch = new Map<string, string[]>();
  for (const r of rows) {
    if (!byBranch.has(r.branch)) byBranch.set(r.branch, []);
    byBranch.get(r.branch)!.push(r.date);
  }
  console.log(`${byBranch.size} branches, ${rows.length} branch/date combos total.`);

  for (const [branch, dates] of byBranch) {
    const t0 = Date.now();
    await recomputeCloseSaAnalyticsForDates(branch, dates);
    console.log(`${branch}: recomputed ${dates.length} dates in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  console.log("Done.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
