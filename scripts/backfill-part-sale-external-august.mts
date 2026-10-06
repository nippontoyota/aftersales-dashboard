// Recompute August 2026 part_sale_snapshots.external_sales (and the rest of
// PartSaleCounts) under the current External Sales rule (2026-09-15 rewrite +
// 2026-09-23 FK cross-month netting). Almost all August files were uploaded
// 2026-08-29–09-02, before that rewrite, so they carry the old ("AA" literal
// prefix) rule's mostly-zero values.
//
// SCOPE: August 2026, excluding KL01A and KL01B — those two also uploaded
// weekly files that overlap their monthly cumulative file's BillNo set (real
// double-counting risk, confirmed via scripts/inspect-august-part-sale.mts),
// and need a manual dedup decision before recomputing, same as the
// September cumulative/duplicate fixes documented in docs/data-reconciliation.md.
// A snapshot with zero raw rows on file is skipped (nothing to recompute from).
//
//   npx tsx scripts/backfill-part-sale-external-august.mts [--commit]
import "./load-env.mjs";
import { partSaleCountsFromRows, alwaysEligible } from "../src/lib/part-sale/parse";
import { savePartSaleSnapshot } from "../src/lib/part-sale/store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const EXCLUDED_BRANCHES = ["KL01A", "KL01B"];

const { rows: snaps } = await pool.query<{
  branch: string;
  date: string;
  source_file_name: string;
  external_sales: string;
  uploaded_by: string | null;
}>(
  `select branch, date::text as date, source_file_name, external_sales, uploaded_by
     from part_sale_snapshots
    where date >= '2026-08-01' and date <= '2026-08-31'
      and branch <> all($1)
    order by branch, date`,
  [EXCLUDED_BRANCHES],
);

let changed = 0;
const changes: { branch: string; date: string; before: number; after: number }[] = [];
for (const s of snaps) {
  const { rows: raw } = await pool.query<{ row_data: Record<string, unknown> }>(
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
  const before = Number(s.external_sales);
  const after = counts.externalSales;
  const mark = before.toFixed(2) !== after.toFixed(2) ? "  *CHANGED*" : "";
  console.log(`${s.branch} ${s.date}  External Sales  ${before.toFixed(2)} -> ${after.toFixed(2)}${mark}`);
  if (mark) {
    changed++;
    changes.push({ branch: s.branch, date: s.date, before, after });
    if (COMMIT) {
      await savePartSaleSnapshot({
        date: s.date,
        branch: s.branch,
        uploadedAt: new Date().toISOString(),
        sourceFileName: s.source_file_name,
        counts,
        uploadedBy: s.uploaded_by,
      });
    }
  }
}

console.log(`\n${changed} snapshot(s) ${COMMIT ? "updated" : "would change"}.`);
if (!COMMIT) console.log("Dry run — re-run with --commit to write.");
if (changes.length > 0) {
  const total = changes.reduce((a, c) => a + (c.after - c.before), 0);
  console.log(`Net External Sales delta: ${total.toFixed(2)}`);
}
await pool.end();
