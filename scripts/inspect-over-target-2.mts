// Checking whether "Over Target" is a per-job-line value or actually
// constant across every line of the same RO (Job No.) — the first sample
// showed the same value repeating across several different, unrelated job
// codes in a row, which would only make sense if it's RO-level.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows where report_type = 'labour_sales' limit 3000`,
);

const byJobNo = new Map<string, { jobCode: string; soldHour: string; overTarget: string }[]>();
for (const r of rows) {
  const jobNo = String(r.row_data["Job No."] ?? "").trim();
  if (!jobNo) continue;
  const list = byJobNo.get(jobNo) ?? [];
  list.push({
    jobCode: String(r.row_data["Job Code"] ?? ""),
    soldHour: String(r.row_data["Sold Hour"] ?? ""),
    overTarget: String(r.row_data["Over Target"] ?? ""),
  });
  byJobNo.set(jobNo, list);
}

let multiLineRoCount = 0;
let constantOverTargetCount = 0;
let shownExamples = 0;
for (const [jobNo, lines] of byJobNo) {
  if (lines.length < 2) continue;
  multiLineRoCount++;
  const distinctOverTargets = new Set(lines.map((l) => l.overTarget));
  if (distinctOverTargets.size === 1) constantOverTargetCount++;
  if (shownExamples < 5 && lines.length >= 2) {
    console.log(`RO ${jobNo} (${lines.length} lines):`);
    for (const l of lines) console.log(`   jobCode=${l.jobCode}  soldHour=${l.soldHour}  overTarget=${l.overTarget}`);
    shownExamples++;
  }
}
console.log(`\nMulti-line ROs sampled: ${multiLineRoCount}, with a single constant Over Target across all their lines: ${constantOverTargetCount}`);

await pool.end();
