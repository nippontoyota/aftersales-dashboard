// How many EM60 ROs have a wildly long Open→Invoice duration (likely a
// data anomaly — RO left open across months — rather than a real slow
// service) vs a normal-range one. October 2026 sample.
import "./load-env.mjs";
import { pool } from "../src/lib/db";

function parseDT(dateStr: unknown, timeStr: unknown): number | null {
  const dm = String(dateStr ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  const tm = String(timeStr ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const year = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3]);
  return Date.UTC(year, Number(dm[1]) - 1, Number(dm[2]), Number(tm[1]), Number(tm[2])) / 60_000;
}

const { rows } = await pool.query<{ row_data: Record<string, unknown>; branch: string; date: string }>(
  `select row_data, branch, date::text as date from raw_upload_rows
     where report_type = 'service_info' and date >= '2026-10-01' and date <= '2026-10-20'
       and row_data->>'EM Flag' = 'EM60'`,
);
const byRo = new Map<string, { row_data: Record<string, unknown>; branch: string; date: string }>();
for (const r of rows) {
  const ro = String(r.row_data["Job Order No"] ?? "");
  const key = `${r.branch}|${r.date}|${ro}`;
  if (ro && !byRo.has(key)) byRo.set(key, r);
}

const buckets = { normal: 0, under4h: 0, under1d: 0, over1d: 0, unreadable: 0 };
const bigOutliers: unknown[] = [];
for (const { row_data: d, branch, date } of byRo.values()) {
  const open = parseDT(d["Job Open Date"], d["Job Open Time"]);
  const inv = parseDT(d["Invoice Date"], d["Invoice Time"]);
  if (open === null || inv === null) { buckets.unreadable++; continue; }
  const mins = inv - open;
  if (mins <= 60) buckets.normal++;
  else if (mins <= 240) buckets.under4h++;
  else if (mins <= 1440) buckets.under1d++;
  else {
    buckets.over1d++;
    if (bigOutliers.length < 8) bigOutliers.push({ branch, date, ro: d["Job Order No"], days: (mins / 1440).toFixed(1) });
  }
}
console.log(`Total distinct EM60 ROs checked: ${byRo.size}`);
console.log(buckets);
console.log("\nExamples over 1 day:", bigOutliers);

await pool.end();
