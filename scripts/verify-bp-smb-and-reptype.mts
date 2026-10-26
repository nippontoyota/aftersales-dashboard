// Small sample: workOrdNo (vs Job Order No) and BP Rep Type real values, on
// service_info_bp rows only.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

console.log("=== BP Rep Type distinct values (Oct 2026) ===");
const { rows: repType } = await pool.query<{ v: string; n: string }>(
  `select row_data->>'BP Rep Type' as v, count(*) as n
     from raw_upload_rows where report_type = 'service_info_bp' and date >= '2026-10-01'
     group by 1 order by 2 desc limit 15`,
);
console.log(repType);

console.log("\n=== workOrdNo vs Job Order No, sample rows (BP) ===");
const { rows: sample } = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows where report_type = 'service_info_bp' and date >= '2026-10-01' limit 300`,
);
let blankWorkOrd = 0, nonBlankWorkOrd = 0;
const pairs = new Map<string, Set<string>>(); // Job Order No -> set of workOrdNo seen
for (const r of sample) {
  const wo = String(r.row_data["workOrdNo"] ?? "").trim();
  const ro = String(r.row_data["Job Order No"] ?? "").trim();
  if (!wo) blankWorkOrd++; else nonBlankWorkOrd++;
  if (ro) {
    if (!pairs.has(ro)) pairs.set(ro, new Set());
    if (wo) pairs.get(ro)!.add(wo);
  }
}
console.log(`blank workOrdNo: ${blankWorkOrd}, non-blank: ${nonBlankWorkOrd} (of ${sample.length} rows)`);
let roWithMultipleWo = 0;
for (const [, woSet] of pairs) if (woSet.size > 1) roWithMultipleWo++;
console.log(`Distinct ROs seen: ${pairs.size}, ROs with >1 distinct workOrdNo: ${roWithMultipleWo}`);
console.log("5 example rows:", sample.slice(0, 5).map((r) => ({ ro: r.row_data["Job Order No"], wo: r.row_data["workOrdNo"], repType: r.row_data["BP Rep Type"] })));

await pool.end();
