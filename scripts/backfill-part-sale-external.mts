// Re-derive every September part_sale snapshot from the raw rows already on
// file, using the fixed External Sales filter (BillNo first letter `A` =
// external, any branch — was a literal `"AA"` that only matched CO01B).
// scom205-style: reads raw_upload_rows, never re-uploads.
//
//   npx tsx scripts/backfill-part-sale-external.mts [--commit]
import "./load-env.mjs";
import { partSaleCountsFromRows } from "../src/lib/part-sale/parse";
import { savePartSaleSnapshot } from "../src/lib/part-sale/store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const FROM = "2026-09-01";

const { rows: snaps } = await pool.query<{
  branch: string;
  date: string;
  source_file_name: string;
  external_sales: string;
}>(
  `select branch, date::text as date, source_file_name, external_sales
     from part_sale_snapshots where date >= $1 order by branch, date`,
  [FROM],
);

let changed = 0;
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
  const counts = partSaleCountsFromRows(raw.map((r) => r.row_data));
  const before = Number(s.external_sales);
  const after = counts.externalSales;
  const mark = before.toFixed(2) !== after.toFixed(2) ? "  *" : "";
  console.log(`${s.branch} ${s.date}  External Sales  ${before.toFixed(2)} -> ${after.toFixed(2)}${mark}`);
  if (mark) {
    changed++;
    if (COMMIT) {
      await savePartSaleSnapshot({
        date: s.date,
        branch: s.branch,
        uploadedAt: new Date().toISOString(),
        sourceFileName: s.source_file_name,
        counts,
      });
    }
  }
}

console.log(`\n${changed} snapshot(s) ${COMMIT ? "updated" : "would change"}.`);
if (!COMMIT) console.log("Dry run — re-run with --commit to write.");
await pool.end();
