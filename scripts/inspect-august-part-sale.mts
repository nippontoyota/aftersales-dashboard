// Read-only inspection: every August 2026 part_sale snapshot, its raw-row
// coverage, recomputed External Sales under the current rule, and whether its
// BillNo set overlaps another snapshot in the same branch/month (duplicate
// cumulative vs weekly upload detection).
import "./load-env.mjs";
import { partSaleCountsFromRows, alwaysEligible } from "../src/lib/part-sale/parse";
import { pool } from "../src/lib/db";

const { rows: snaps } = await pool.query<{
  branch: string;
  date: string;
  source_file_name: string;
  external_sales: string;
  uploaded_at: string;
}>(
  `select branch, date::text as date, source_file_name, external_sales, uploaded_at::text as uploaded_at
     from part_sale_snapshots where date >= '2026-08-01' and date <= '2026-08-31'
     order by branch, date`,
);

type Info = {
  branch: string;
  date: string;
  file: string;
  uploadedAt: string;
  stored: number;
  rawCount: number;
  recomputed: number;
  bills: Set<string>;
};

const infos: Info[] = [];
for (const s of snaps) {
  const { rows: raw } = await pool.query<{ row_data: Record<string, unknown> }>(
    `select row_data from raw_upload_rows
      where report_type = 'part_sale' and branch = $1 and date = $2 order by row_index`,
    [s.branch, s.date],
  );
  const rawRows = raw.map((r) => r.row_data);
  const counts = rawRows.length > 0 ? partSaleCountsFromRows(rawRows, alwaysEligible) : null;
  const bills = new Set(rawRows.map((r) => String(r["BillNo"] ?? "").trim()).filter(Boolean));
  infos.push({
    branch: s.branch,
    date: s.date,
    file: s.source_file_name,
    uploadedAt: s.uploaded_at,
    stored: Number(s.external_sales),
    rawCount: rawRows.length,
    recomputed: counts?.externalSales ?? NaN,
    bills,
  });
}

console.log("=== Per snapshot ===");
for (const i of infos) {
  const changeMark = !Number.isNaN(i.recomputed) && i.stored.toFixed(2) !== i.recomputed.toFixed(2) ? " *DIFF*" : "";
  const orphan = i.rawCount === 0 ? " [NO RAW ROWS]" : "";
  console.log(
    `${i.branch} ${i.date}  raw=${i.rawCount.toString().padStart(5)}  stored=${i.stored.toFixed(0).padStart(10)}  recomputed=${Number.isNaN(i.recomputed) ? "n/a" : i.recomputed.toFixed(0).padStart(10)}${changeMark}${orphan}  file="${i.file}"  uploaded=${i.uploadedAt}`,
  );
}

console.log("\n=== Overlap check (same BillNo appearing under >1 snapshot, same branch) ===");
const byBranch = new Map<string, Info[]>();
for (const i of infos) {
  if (!byBranch.has(i.branch)) byBranch.set(i.branch, []);
  byBranch.get(i.branch)!.push(i);
}
for (const [branch, list] of byBranch) {
  if (list.length < 2) continue;
  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) {
      const A = list[a], B = list[b];
      const shared = [...A.bills].filter((x) => B.bills.has(x));
      if (shared.length > 0) {
        console.log(`${branch}: ${A.date} (${A.bills.size} bills) overlaps ${B.date} (${B.bills.size} bills) — ${shared.length} shared bill numbers, e.g. ${shared.slice(0, 3).join(", ")}`);
      }
    }
  }
}

console.log("\n=== Branch totals ===");
const totalsByBranch = new Map<string, { stored: number; recomputed: number; snapshots: number }>();
for (const i of infos) {
  const t = totalsByBranch.get(i.branch) ?? { stored: 0, recomputed: 0, snapshots: 0 };
  t.stored += i.stored;
  t.recomputed += Number.isNaN(i.recomputed) ? 0 : i.recomputed;
  t.snapshots += 1;
  totalsByBranch.set(i.branch, t);
}
let grandStored = 0, grandRecomputed = 0;
for (const [branch, t] of [...totalsByBranch.entries()].sort()) {
  console.log(`${branch}: snapshots=${t.snapshots}  stored=${t.stored.toFixed(0)}  recomputed(naive sum, may double-count)=${t.recomputed.toFixed(0)}`);
  grandStored += t.stored;
  grandRecomputed += t.recomputed;
}
console.log(`\nGRAND TOTAL stored=${grandStored.toFixed(0)}  recomputed(naive sum)=${grandRecomputed.toFixed(0)}`);

await pool.end();
