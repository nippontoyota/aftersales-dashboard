import "./load-env.mjs";
import { findRepeatJobs, repeatJobCountsBySa } from "../src/lib/close-sa-analytics/repeat-jobs";
import { pool } from "../src/lib/db";

const flags = await findRepeatJobs("CO01A", "2026-10-01", "2026-10-22");
console.log(`${flags.length} repeat-job flags, CO01A Oct 1-22:`);
for (const f of flags) console.log(f);
console.log("\nBy SA:", repeatJobCountsBySa(flags));

await pool.end();
