// Same Day Delivery (Job Open Date == Invoice Date) and EM-to-PM ratio, on
// one branch/date sample.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

const { rows } = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows
     where report_type = 'service_info' and branch = 'CO01A' and date = '2026-10-20'`,
);
const byRo = new Map<string, Record<string, unknown>>();
for (const r of rows) {
  const ro = String(r.row_data["Job Order No"] ?? "");
  if (ro && !byRo.has(ro)) byRo.set(ro, r.row_data);
}

const PM_JOB_DESC = /^(?:\d{1,3}(?:,\d{3})*\s*KM SERVICE|Vcare - )/i;
let sameDay = 0, diffDay = 0, unreadable = 0, pmCount = 0, emCount = 0;
for (const d of byRo.values()) {
  const openDate = String(d["Job Open Date"] ?? "").trim();
  const invDate = String(d["Invoice Date"] ?? "").trim();
  if (!openDate || !invDate) unreadable++;
  else if (openDate === invDate) sameDay++;
  else diffDay++;

  const desc = String(d["Job Desc"] ?? "");
  // Note: Job Desc here is just the row's own first-seen job code line, not
  // necessarily the RO's PM line — this is a rough check only.
}

console.log(`CO01A 2026-10-20: ${byRo.size} ROs — sameDay=${sameDay}, diffDay=${diffDay}, unreadable=${unreadable}`);

// EM-to-PM: distinct ROs with a PM job line (any KM service or Vcare) vs
// distinct ROs with an EM flag set (any tier).
const { rows: allRows } = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows
     where report_type = 'service_info' and branch = 'CO01A' and date >= '2026-10-01' and date <= '2026-10-20'`,
);
const pmRos = new Set<string>();
const emRos = new Set<string>();
for (const r of allRows) {
  const ro = String(r.row_data["Job Order No"] ?? "");
  if (!ro) continue;
  if (PM_JOB_DESC.test(String(r.row_data["Job Desc"] ?? ""))) pmRos.add(ro);
  const em = String(r.row_data["EM Flag"] ?? "").toUpperCase();
  if (em && em !== "NO") emRos.add(ro);
}
console.log(`\nCO01A Oct 1-20: distinct PM ROs=${pmRos.size}, distinct EM-flagged ROs=${emRos.size}`);
const emNotPm = [...emRos].filter((ro) => !pmRos.has(ro));
console.log(`EM-flagged ROs that do NOT show a PM job line in this sample: ${emNotPm.length} (e.g. ${emNotPm.slice(0, 3)})`);

await pool.end();
