// One-off: Service Info Report - BP is now parsed for Wheel Balancing /
// Wheel Alignment / Brake Skimming / VAS Revenue (never Evaporator
// Cleaning), the same rules as the GS report — 2026-09-11, at the user's
// request. This backfills every September BP file already on file
// (raw_report_uploads, report_type='service_info_bp') into the new
// service_info_bp_snapshots table, using the same parser and each branch's
// own Accessories roster as of today.
//
//   npx tsx scripts/backfill-service-info-bp.mts [--commit]
import "./load-env.mjs";
import { parseServiceInfoWorkbook } from "../src/lib/service-info/parse";
import { saveServiceInfoBpSnapshot } from "../src/lib/service-info-bp/store";
import { listAccessoriesStaffNamesForBranch } from "../src/lib/accessories-staff-store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const MONTH_START = "2026-09-01";

const { rows } = await pool.query<{ date: string; branch: string; source_file_name: string; uploaded_at: Date; file_data: Buffer }>(
  `select date::text as date, branch, source_file_name, uploaded_at, file_data
     from raw_report_uploads
    where report_type = 'service_info_bp' and date >= $1
    order by branch, date`,
  [MONTH_START]
);
console.log(`${rows.length} Service Info - BP file(s) on file for September.\n`);

const staffCache = new Map<string, string[]>();
async function staffFor(branch: string): Promise<string[]> {
  if (!staffCache.has(branch)) staffCache.set(branch, await listAccessoriesStaffNamesForBranch(branch));
  return staffCache.get(branch)!;
}

let parsed = 0,
  skipped = 0,
  totalWb = 0,
  totalWa = 0,
  totalBs = 0,
  totalVas = 0;

for (const r of rows) {
  try {
    const staffNames = await staffFor(r.branch);
    const { counts } = parseServiceInfoWorkbook(r.file_data, r.branch, staffNames);
    const nonZero = counts.wheelBalancing || counts.wheelAlignment || counts.brakeSkimming || counts.vasRevenue;
    console.log(
      `${r.branch}  ${r.date}  (${r.source_file_name})  ` +
        `WB ${counts.wheelBalancing}  WA ${counts.wheelAlignment}  BS ${counts.brakeSkimming}  VAS ₹${counts.vasRevenue.toFixed(2)}` +
        (nonZero ? "  *" : "")
    );
    totalWb += counts.wheelBalancing;
    totalWa += counts.wheelAlignment;
    totalBs += counts.brakeSkimming;
    totalVas += counts.vasRevenue;
    parsed++;
    if (COMMIT) {
      await saveServiceInfoBpSnapshot({
        date: r.date,
        branch: r.branch,
        uploadedAt: r.uploaded_at.toISOString(),
        sourceFileName: r.source_file_name,
        counts,
      });
    }
  } catch (err) {
    skipped++;
    console.log(`${r.branch}  ${r.date}  (${r.source_file_name})  -- could not parse: ${err instanceof Error ? err.message : err}`);
  }
}

console.log(`\n${parsed} parsed, ${skipped} skipped (not Service Info-shaped).`);
console.log(`Totals pulled from BP: WB ${totalWb}, WA ${totalWa}, Brake Skimming ${totalBs}, VAS ₹${totalVas.toFixed(2)}`);
console.log(COMMIT ? "\nCommitted." : "\nDry run — re-run with --commit to write service_info_bp_snapshots.");
await pool.end();
