// Resolve the August KL01A/KL01B weekly-vs-cumulative Part Sale duplication
// and CO01B's duplicate 08-28 orphan snapshot (see docs/data-reconciliation.md,
// "August · External Sales stuck on the old rule"). User-approved plan
// (2026-09-30): keep each branch's monthly cumulative file as the source of
// truth for the range it covers, drop weekly snapshots wholly contained in
// it, and for KL01A's 08-30 (partial overlap with the cumulative's tail)
// keep only the bills not already in the cumulative.
//
//   npx tsx scripts/fix-kl-co01b-august-dedup.mts [--commit]
import "./load-env.mjs";
import { partSaleCountsFromRows, alwaysEligible } from "../src/lib/part-sale/parse";
import { savePartSaleSnapshot } from "../src/lib/part-sale/store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");

async function rawRows(branch: string, date: string) {
  const { rows } = await pool.query<{ row_data: Record<string, unknown> }>(
    `select row_data from raw_upload_rows where report_type='part_sale' and branch=$1 and date=$2 order by row_index`,
    [branch, date],
  );
  return rows.map((r) => r.row_data);
}

async function recompute(branch: string, date: string, label: string) {
  const { rows: s } = await pool.query<{ source_file_name: string; external_sales: string; uploaded_by: string | null }>(
    `select source_file_name, external_sales, uploaded_by from part_sale_snapshots where branch=$1 and date=$2`,
    [branch, date],
  );
  if (s.length === 0) { console.log(`${label}: no snapshot found, skipping`); return; }
  const raw = await rawRows(branch, date);
  const counts = partSaleCountsFromRows(raw, alwaysEligible);
  console.log(`${label}  External Sales  ${Number(s[0].external_sales).toFixed(2)} -> ${counts.externalSales.toFixed(2)}  (${raw.length} rows)`);
  if (COMMIT) {
    await savePartSaleSnapshot({
      date, branch, uploadedAt: new Date().toISOString(),
      sourceFileName: s[0].source_file_name, counts, uploadedBy: s[0].uploaded_by,
    });
  }
}

async function deleteSnapshot(branch: string, date: string, label: string) {
  console.log(`${label}  DELETE snapshot`);
  if (COMMIT) {
    await pool.query(`delete from part_sale_snapshots where branch=$1 and date=$2`, [branch, date]);
  }
}

console.log("=== CO01B ===");
await deleteSnapshot("CO01B", "2026-08-28", "CO01B 2026-08-28 (duplicate of 08-27, 0 raw rows)");

console.log("\n=== KL01A ===");
await recompute("KL01A", "2026-08-28", "KL01A 2026-08-28 (cumulative, source of truth for 1-28)");
await deleteSnapshot("KL01A", "2026-08-07", "KL01A 2026-08-07 (weekly, subset of 08-28)");
await deleteSnapshot("KL01A", "2026-08-14", "KL01A 2026-08-14 (weekly, subset of 08-28)");
await deleteSnapshot("KL01A", "2026-08-21", "KL01A 2026-08-21 (weekly, subset of 08-28)");
// dry run showed 08-30's 311 bills are ALL already in 08-28's cumulative (full
// containment, not partial) — delete outright rather than leave a zeroed row.
await deleteSnapshot("KL01A", "2026-08-30", "KL01A 2026-08-30 (weekly, fully contained in 08-28)");
await recompute("KL01A", "2026-08-29", "KL01A 2026-08-29 (daily, no overlap)");
await recompute("KL01A", "2026-08-31", "KL01A 2026-08-31 (daily, no overlap)");

console.log("\n=== KL01B ===");
await recompute("KL01B", "2026-08-27", "KL01B 2026-08-27 (cumulative, source of truth for 1-27)");
await deleteSnapshot("KL01B", "2026-08-09", "KL01B 2026-08-09 (weekly, subset of 08-27)");
await deleteSnapshot("KL01B", "2026-08-16", "KL01B 2026-08-16 (weekly, subset of 08-27)");
await deleteSnapshot("KL01B", "2026-08-24", "KL01B 2026-08-24 (weekly, subset of 08-27)");
await deleteSnapshot("KL01B", "2026-08-28", "KL01B 2026-08-28 (duplicate of 08-27, 0 raw rows)");
await recompute("KL01B", "2026-08-29", "KL01B 2026-08-29 (daily, no overlap)");
await recompute("KL01B", "2026-08-31", "KL01B 2026-08-31 (daily, no overlap)");

console.log(`\n${COMMIT ? "Committed." : "Dry run — re-run with --commit to write."}`);
await pool.end();
