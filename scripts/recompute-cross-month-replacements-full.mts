// One-off: recomputes cross_month_replacements company-wide after the
// 2026-10-07 rule change (subtract the ORIGINAL invoice's value, not the
// replacement's — see cross-month-replacement.ts's doc comment) and the
// same day's SSRV089-BP parsing. Needed once so the new
// original_part_sale/original_labour_sale columns get populated for rows
// that already existed before this code shipped — NEW_RULE_CUTOVER_DATE
// still gates which rows actually use the new value (see
// loadCrossMonthReplacementAdjustmentForMonth), so this is safe: it only
// ever fills in data, it does not retroactively change which formula a
// pre-cutover replacement uses.
//
// Run with: node scripts/recompute-cross-month-replacements-full.mts
import "./load-env.mjs";
import { pool } from "../src/lib/db.ts";
import { recomputeCrossMonthReplacements } from "../src/lib/cancellation/cross-month-replacement.ts";

await recomputeCrossMonthReplacements();
console.log("cross_month_replacements recomputed company-wide.");
await pool.end();
