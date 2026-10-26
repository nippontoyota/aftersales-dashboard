// One-off backfill (2026-10-24): populates unique_vin_vas_daily for every
// (date, branch) that already has a Service Info (GS or BP) upload this
// October, so the Revenue Stream Excel export is correct for the whole
// month, not just going forward from today's upload.
import "./load-env.mjs";
import { pool } from "../src/lib/db";
import { recomputeUniqueVinVas } from "../src/lib/unique-vin-vas/recompute";

const START_DATE = "2026-10-01";
const END_DATE = "2026-10-24";

const { rows } = await pool.query<{ date: string; branch: string }>(
  `select distinct date::text as date, branch
   from raw_upload_rows
   where report_type in ('service_info', 'service_info_bp')
     and date >= $1 and date <= $2
   order by date, branch`,
  [START_DATE, END_DATE]
);

console.log(`Backfilling ${rows.length} (date, branch) pairs...`);
for (const { date, branch } of rows) {
  await recomputeUniqueVinVas(branch, date);
}
console.log("Done.");

await pool.end();
