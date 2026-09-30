import "./load-env.mjs";
import { pool } from "../src/lib/db";

for (const branch of ["KL01A", "KL01B"]) {
  console.log(`\n=== ${branch} ===`);
  const { rows: snaps } = await pool.query<{ date: string; source_file_name: string }>(
    `select date::text as date, source_file_name from part_sale_snapshots
      where branch = $1 and date >= '2026-08-01' and date <= '2026-08-31' order by date`,
    [branch],
  );
  for (const s of snaps) {
    const { rows: raw } = await pool.query<{ row_data: Record<string, unknown> }>(
      `select row_data from raw_upload_rows where report_type='part_sale' and branch=$1 and date=$2`,
      [branch, s.date],
    );
    const saleDates = raw.map((r) => String(r.row_data["SaleDate"] ?? "").trim()).filter(Boolean);
    const uniq = [...new Set(saleDates)].sort();
    console.log(`  ${s.date}  rows=${raw.length}  file="${s.source_file_name}"  distinct SaleDate values (sample): ${uniq.slice(0, 3).join(" | ")} ... ${uniq.slice(-3).join(" | ")}  (${uniq.length} distinct)`);
  }
}
await pool.end();
