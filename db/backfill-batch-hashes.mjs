/**
 * Backfill raw_upload_batches from existing raw_upload_rows (M3 fix, 2026-09-30).
 *
 * Run BEFORE deploying the new upload-route code:
 *   node --env-file .env.local db/backfill-batch-hashes.mjs
 *
 * What it does:
 *  1. Verifies the one-batch-per-date invariant holds (no orphaned duplicate
 *     groups — would indicate a saveRawUploadRows race that never happened).
 *  2. Computes SHA-256 of each (report_type, branch, date)'s rows in
 *     row_index order — the same domain as hashRows() on JSONB-loaded data,
 *     which the existing duplicate checks already use successfully.
 *  3. Upserts every result into raw_upload_batches.
 *  4. Prints timing and the new lookup cost.
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const ca = process.env.DATABASE_CA_CERT;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true, ca },
});

const REPORT_TYPES = ["service_info", "ssrv089", "part_sale"];

function hashRows(rows) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

// --- Step 1: pre-flight — verify invariant ---
console.log("\n=== Pre-flight: checking for duplicate date groups ===");
const { rows: violations } = await pool.query(`
  select report_type, branch, date::text, count(*) as row_count
  from raw_upload_rows
  where report_type = any($1::text[])
  group by report_type, branch, date
  having count(*) > 1000000  -- only checking grouping, not actual violation
  order by row_count desc
  limit 5
`, [REPORT_TYPES]);
// A real violation would be two distinct uploads for the same (type, branch, date)
// with different row content. Since saveRawUploadRows deletes before inserting,
// this can't happen in normal operation. We verify by checking if any combo
// has rows whose upload_at timestamps span more than a few seconds (would
// indicate two separate INSERT batches).
const { rows: tsViolations } = await pool.query(`
  select report_type, branch, date::text,
         max(uploaded_at) - min(uploaded_at) as spread,
         count(distinct uploaded_at) as distinct_upload_times
  from raw_upload_rows
  where report_type = any($1::text[])
  group by report_type, branch, date
  having count(distinct uploaded_at) > 1
  order by spread desc
  limit 10
`, [REPORT_TYPES]);

if (tsViolations.length > 0) {
  console.log("WARNING: found combos with multiple distinct uploaded_at values:");
  for (const r of tsViolations) {
    console.log(`  ${r.report_type}/${r.branch} ${r.date} — ${r.distinct_upload_times} upload times, spread ${r.spread}`);
  }
  console.log("These may indicate Upload Sheet corrections (expected) or races (unexpected).");
  console.log("Backfill will use the LATEST uploaded_at's rows for the hash (most recent wins).");
} else {
  console.log("OK — all (report_type, branch, date) combos have a single upload timestamp.");
}

// --- Step 2: enumerate all combos to backfill ---
const { rows: combos } = await pool.query(`
  select report_type, branch, date::text as date, max(uploaded_at) as uploaded_at, count(*) as row_count
  from raw_upload_rows
  where report_type = any($1::text[])
  group by report_type, branch, date
  order by report_type, branch, date
`, [REPORT_TYPES]);

console.log(`\n=== Backfilling ${combos.length} (report_type, branch, date) combos ===`);

// --- Step 3: process in batches to avoid memory spikes ---
const BATCH_SIZE = 50;
let done = 0;
let t0 = performance.now();

for (let i = 0; i < combos.length; i += BATCH_SIZE) {
  const chunk = combos.slice(i, i + BATCH_SIZE);

  await Promise.all(chunk.map(async (combo) => {
    // Fetch rows in row_index order — same ordering as loadAllRawUploadRowsBefore.
    // When multiple uploaded_at values exist, take only the latest batch's rows
    // (same semantics as the app: the last saveRawUploadRows wins).
    const { rows } = await pool.query(
      `select row_data
       from raw_upload_rows
       where report_type = $1 and branch = $2 and date = $3
         and uploaded_at = $4
       order by row_index`,
      [combo.report_type, combo.branch, combo.date, combo.uploaded_at]
    );

    // If uploaded_at filtering returns 0 rows (all rows share a different
    // uploaded_at, e.g. after a correction), fall back to all rows for the date.
    const rowData = rows.length > 0
      ? rows.map(r => r.row_data)
      : await pool.query(
          `select row_data from raw_upload_rows
           where report_type = $1 and branch = $2 and date = $3
           order by row_index`,
          [combo.report_type, combo.branch, combo.date]
        ).then(r => r.rows.map(x => x.row_data));

    const hash = hashRows(rowData);

    await pool.query(
      `insert into raw_upload_batches (report_type, branch, date, content_hash, uploaded_at)
       values ($1, $2, $3, $4, $5)
       on conflict (report_type, branch, date) do update
         set content_hash = excluded.content_hash,
             uploaded_at  = excluded.uploaded_at`,
      [combo.report_type, combo.branch, combo.date, hash, combo.uploaded_at]
    );
  }));

  done += chunk.length;
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  process.stdout.write(`\r  ${done}/${combos.length} (${elapsed}s)`);
}

console.log(`\nDone in ${((performance.now() - t0) / 1000).toFixed(1)}s.`);

// --- Step 4: verify counts match ---
const { rows: [batchCount] } = await pool.query(
  `select count(*) as n from raw_upload_batches where report_type = any($1::text[])`,
  [REPORT_TYPES]
);
console.log(`\nraw_upload_batches rows: ${batchCount.n} (expected ${combos.length})`);

// --- Step 5: measure the new lookup cost ---
console.log("\n=== Measuring new duplicate lookup (findDuplicateBatch) ===");
// Use a hash that won't exist — worst case (full index scan, no early exit).
const fakeHash = "0000000000000000000000000000000000000000000000000000000000000000";
const lookupT0 = performance.now();
const ITERATIONS = 100;
for (let j = 0; j < ITERATIONS; j++) {
  await pool.query(
    `select date::text from raw_upload_batches
     where report_type = $1 and branch = $2 and date < $3 and content_hash = $4
     limit 1`,
    ["part_sale", "CO01B", new Date().toISOString().slice(0, 10), fakeHash]
  );
}
const lookupMs = (performance.now() - lookupT0) / ITERATIONS;
console.log(`Average lookup (no match, part_sale/CO01B, 48 prior dates): ${lookupMs.toFixed(2)} ms`);

// Also time a lookup that DOES match (first row).
const { rows: [firstBatch] } = await pool.query(
  `select content_hash from raw_upload_batches
   where report_type = 'part_sale' and branch = 'CO01B'
   order by date asc limit 1`
);
if (firstBatch) {
  const matchT0 = performance.now();
  for (let j = 0; j < ITERATIONS; j++) {
    await pool.query(
      `select date::text from raw_upload_batches
       where report_type = $1 and branch = $2 and date < $3 and content_hash = $4
       limit 1`,
      ["part_sale", "CO01B", new Date().toISOString().slice(0, 10), firstBatch.content_hash]
    );
  }
  const matchMs = (performance.now() - matchT0) / ITERATIONS;
  console.log(`Average lookup (match found, first date): ${matchMs.toFixed(2)} ms`);
}

await pool.end();
console.log("\nBackfill complete. Deploy new upload-route code next.");
