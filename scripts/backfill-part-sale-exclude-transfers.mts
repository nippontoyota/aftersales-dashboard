// Re-derive every part_sale snapshot's Engine Flush / Injector Cleaner /
// Synthetic Oil / Brake Cleaning Spray / DIY count+revenue from the raw rows
// already on file, now that partSaleCountsFromRows excludes branch-to-branch
// stock transfers (see isInternalTransferRow in src/lib/part-sale/parse.ts —
// added 2026-10-23 after TL01A's Engine Flush came up 11 instead of 3 for
// 2026-10-20, 7 of them a transfer to Kottayam booked under the receiving
// branch's own name as "CustomerName").
//
// Scope: full history, every branch/date with a part_sale snapshot. Only
// updates the 6 fields above — external_sales, uploaded_at, source_file_name
// and uploaded_by are left exactly as they are (External Sales already only
// counts `A`-type bills, which transfers never are, and recomputing it here
// would risk reopening the separate FK-eligibility nuance those fields carry
// for pre-September-2026 months — see recompute-part-sale-fk-all-months.mts).
//
//   npx tsx scripts/backfill-part-sale-exclude-transfers.mts [--commit]
import "./load-env.mjs";
import { partSaleCountsFromRows, alwaysEligible } from "../src/lib/part-sale/parse";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");

const { rows: snaps } = await pool.query<{
  branch: string;
  date: string;
  engine_flush: string;
  injector_cleaner: string;
  synthetic_oil_ltrs: string;
  brake_cleaning_spray: string;
  diy_count: string;
  diy_revenue: string;
}>(
  `select branch, date::text as date, engine_flush, injector_cleaner, synthetic_oil_ltrs, brake_cleaning_spray, diy_count, diy_revenue
     from part_sale_snapshots order by branch, date`,
);

// Supabase's pooler occasionally drops an idle connection mid-run over
// ~1,100 sequential queries — retry once rather than losing the whole run.
async function queryWithRetry<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }> {
  try {
    return await pool.query<T>(sql, params);
  } catch (err) {
    console.error(`  (retrying after: ${(err as Error).message})`);
    await new Promise((r) => setTimeout(r, 1000));
    return await pool.query<T>(sql, params);
  }
}

let changed = 0;
for (const s of snaps) {
  const { rows: raw } = await queryWithRetry<{ row_data: Record<string, unknown> }>(
    `select row_data from raw_upload_rows
      where report_type = 'part_sale' and branch = $1 and date = $2 order by row_index`,
    [s.branch, s.date],
  );
  if (raw.length === 0) {
    console.log(`${s.branch} ${s.date}  — no raw rows on file, skipping`);
    continue;
  }
  const rawRows = raw.map((r) => r.row_data);
  const counts = partSaleCountsFromRows(rawRows, alwaysEligible);

  const before = {
    engineFlush: Number(s.engine_flush),
    injectorCleaner: Number(s.injector_cleaner),
    syntheticOilLtrs: Number(s.synthetic_oil_ltrs),
    brakeCleaningSpray: Number(s.brake_cleaning_spray),
    diyCount: Number(s.diy_count),
    diyRevenue: Number(s.diy_revenue),
  };
  const after = {
    engineFlush: counts.engineFlush,
    injectorCleaner: counts.injectorCleaner,
    syntheticOilLtrs: counts.syntheticOilLtrs,
    brakeCleaningSpray: counts.brakeCleaningSpray,
    diyCount: counts.diyCount,
    diyRevenue: counts.diyRevenue,
  };
  const isChanged = (Object.keys(before) as (keyof typeof before)[]).some(
    (k) => before[k].toFixed(2) !== after[k].toFixed(2),
  );

  if (isChanged) {
    changed++;
    console.log(`${s.branch} ${s.date}  before=${JSON.stringify(before)}  after=${JSON.stringify(after)}`);
    if (COMMIT) {
      await pool.query(
        `update part_sale_snapshots
           set engine_flush = $3, injector_cleaner = $4, synthetic_oil_ltrs = $5, brake_cleaning_spray = $6, diy_count = $7, diy_revenue = $8
         where branch = $1 and date = $2`,
        [s.branch, s.date, after.engineFlush, after.injectorCleaner, after.syntheticOilLtrs, after.brakeCleaningSpray, after.diyCount, after.diyRevenue],
      );
    }
  }
}

console.log(`\n${changed} snapshot(s) ${COMMIT ? "updated" : "would change"} out of ${snaps.length} checked.`);
if (!COMMIT) console.log("Dry run — re-run with --commit to write.");
await pool.end();
