// Small sample only (one branch, one day) — computes RO-open-to-close
// duration for EM60/EM90/EM120-flagged ROs and checks it against that
// flag's own minute target, to see whether an On-Time-Delivery metric is
// actually derivable from what's already in Service Info's raw rows.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

const EM_TARGET_MINUTES: Record<string, number> = { EM60: 60, EM90: 90, EM120: 120 };

function toMinutes(timeStr: string): number | null {
  const m = String(timeStr ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

const { rows: candidate } = await pool.query<{ branch: string; date: string; n: string }>(
  `select branch, date::text as date, count(distinct row_data->>'Job Order No') as n
     from raw_upload_rows
     where report_type = 'service_info' and date >= '2026-10-01'
       and row_data->>'EM Flag' in ('EM60', 'EM90', 'EM120')
     group by branch, date order by n desc limit 1`,
);
console.log("Sample branch/date:", candidate);
if (candidate.length === 0) process.exit(0);
const { branch, date } = candidate[0];

const { rows } = await pool.query<{ row_data: Record<string, unknown> }>(
  `select row_data from raw_upload_rows where report_type = 'service_info' and branch = $1 and date = $2`,
  [branch, date],
);

const byRo = new Map<string, Record<string, unknown>>();
for (const r of rows) {
  const ro = String(r.row_data["Job Order No"] ?? "").trim();
  if (ro && !byRo.has(ro)) byRo.set(ro, r.row_data);
}

const results: { ro: string; sa: string; flag: string; openTime: string; closeTime: string; durationMin: number | null; onTime: boolean | null }[] = [];
for (const [ro, d] of byRo) {
  const flag = String(d["EM Flag"] ?? "");
  if (!(flag in EM_TARGET_MINUTES)) continue;
  const openTime = String(d["Job Open Time"] ?? "");
  const closeTime = String(d["Job Close Time"] ?? "");
  const openMin = toMinutes(openTime);
  const closeMin = toMinutes(closeTime);
  const duration = openMin !== null && closeMin !== null ? closeMin - openMin : null;
  const onTime = duration !== null ? duration <= EM_TARGET_MINUTES[flag] : null;
  results.push({ ro, sa: String(d["Close Service Advisor Name"] ?? ""), flag, openTime, closeTime, durationMin: duration, onTime });
}

console.log(`\n${results.length} EM-flagged ROs for ${branch}/${date}:`);
for (const r of results) console.log(r);

const withDuration = results.filter((r) => r.durationMin !== null);
const onTimeCount = withDuration.filter((r) => r.onTime).length;
console.log(`\nOf ${results.length} EM-flagged ROs: ${withDuration.length} had readable open/close times, ${onTimeCount} on-time (${withDuration.length > 0 ? ((onTimeCount / withDuration.length) * 100).toFixed(0) : 0}%)`);

await pool.end();
