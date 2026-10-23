import "./load-env.mjs";
import { pool } from "../src/lib/db";

const EM_TARGET_MINUTES: Record<string, number> = { EM60: 60, EM90: 90, EM120: 120 };
function toMinutes(timeStr: string): number | null {
  const m = String(timeStr ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Wider sample: every EM-flagged RO across a handful of branches/dates in
// October, looking specifically for how common a late one is.
const { rows } = await pool.query<{ row_data: Record<string, unknown>; branch: string; date: string }>(
  `select row_data, branch, date::text as date from raw_upload_rows
     where report_type = 'service_info' and date >= '2026-10-01' and date <= '2026-10-10'
       and row_data->>'EM Flag' in ('EM60', 'EM90', 'EM120')
     limit 4000`,
);

const byRo = new Map<string, { row_data: Record<string, unknown>; branch: string; date: string }>();
for (const r of rows) {
  const ro = String(r.row_data["Job Order No"] ?? "").trim();
  const key = `${r.branch}|${r.date}|${ro}`;
  if (ro && !byRo.has(key)) byRo.set(key, r);
}

let onTime = 0, late = 0, unreadable = 0;
const lateExamples: unknown[] = [];
for (const { row_data: d, branch, date } of byRo.values()) {
  const flag = String(d["EM Flag"] ?? "");
  const openMin = toMinutes(String(d["Job Open Time"] ?? ""));
  const closeMin = toMinutes(String(d["Job Close Time"] ?? ""));
  if (openMin === null || closeMin === null) { unreadable++; continue; }
  const duration = closeMin - openMin;
  if (duration < 0) { unreadable++; continue; } // crosses midnight or bad data — not handled in this sample check
  if (duration <= EM_TARGET_MINUTES[flag]) onTime++;
  else {
    late++;
    if (lateExamples.length < 5) lateExamples.push({ branch, date, ro: d["Job Order No"], sa: d["Close Service Advisor Name"], flag, duration, target: EM_TARGET_MINUTES[flag] });
  }
}

console.log(`Distinct EM-flagged ROs checked: ${byRo.size}`);
console.log(`On-time: ${onTime}, Late: ${late}, Unreadable/negative: ${unreadable}`);
console.log(`OTD rate: ${((onTime / (onTime + late)) * 100).toFixed(1)}%`);
console.log("\nLate examples:", lateExamples);

await pool.end();
