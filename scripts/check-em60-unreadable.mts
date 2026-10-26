import "./load-env.mjs";
import { pool } from "../src/lib/db";

function parseDT(dateStr: unknown, timeStr: unknown): number | null {
  const dm = String(dateStr ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const tm = String(timeStr ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return null;
  return Date.UTC(Number(dm[3]), Number(dm[1]) - 1, Number(dm[2]), Number(tm[1]), Number(tm[2])) / 60_000;
}

const { rows } = await pool.query<{ row_data: Record<string, unknown>; branch: string; date: string }>(
  `select row_data, branch, date::text as date from raw_upload_rows
     where report_type = 'service_info' and date >= '2026-10-01' and date <= '2026-10-20'
       and row_data->>'EM Flag' = 'EM60'`,
);
const byRo = new Map<string, Record<string, unknown>>();
for (const r of rows) {
  const ro = String(r.row_data["Job Order No"] ?? "");
  if (ro && !byRo.has(ro)) byRo.set(ro, r.row_data);
}

let blankOpenDate = 0, blankOpenTime = 0, blankInvDate = 0, blankInvTime = 0, otherFormat = 0;
const examples: unknown[] = [];
for (const d of byRo.values()) {
  const open = parseDT(d["Job Open Date"], d["Job Open Time"]);
  const inv = parseDT(d["Invoice Date"], d["Invoice Time"]);
  if (open !== null && inv !== null) continue;
  if (!String(d["Job Open Date"] ?? "").trim()) blankOpenDate++;
  if (!String(d["Job Open Time"] ?? "").trim()) blankOpenTime++;
  if (!String(d["Invoice Date"] ?? "").trim()) blankInvDate++;
  if (!String(d["Invoice Time"] ?? "").trim()) blankInvTime++;
  if (
    String(d["Job Open Date"] ?? "").trim() &&
    String(d["Job Open Time"] ?? "").trim() &&
    String(d["Invoice Date"] ?? "").trim() &&
    String(d["Invoice Time"] ?? "").trim()
  ) {
    otherFormat++;
    if (examples.length < 5) {
      examples.push({
        JobOpenDate: d["Job Open Date"],
        JobOpenTime: d["Job Open Time"],
        InvoiceDate: d["Invoice Date"],
        InvoiceTime: d["Invoice Time"],
      });
    }
  }
}
console.log({ blankOpenDate, blankOpenTime, blankInvDate, blankInvTime, otherFormat });
console.log("\nExamples where all 4 fields are non-blank but still failed to parse:", examples);

await pool.end();
