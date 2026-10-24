// Check only — no writes, no file edits. For Oct 1 through today, counts
// ALL TGLOSS-priced job-code lines billed (VAS_PRICE_BY_JOB_CODE — every
// occurrence, not deduped per RO), on ROs NOT closed by an accessories-
// staff SA, GS + BP Service Info combined. Reports per day/branch and MTD
// per branch, plus the RO-count version (distinct ROs with >=1 TGLOSS line)
// for comparison.
import "./load-env.mjs";
import { pool } from "../src/lib/db";
import { VAS_PRICE_BY_JOB_CODE } from "../src/lib/vas-price-list";

const START_DATE = "2026-10-01";
const END_DATE = "2026-10-24";

const TGLOSS_CODES = new Set([...VAS_PRICE_BY_JOB_CODE.keys()]);

function normalizeRo(value: unknown): string {
  return String(value ?? "").trim().replace(/-/g, "").toUpperCase();
}
function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const { rows: staffRows } = await pool.query<{ branch: string; name: string }>(
  `select branch, name from accessories_staff`
);
const accessoriesByBranch = new Map<string, Set<string>>();
for (const r of staffRows) {
  if (!accessoriesByBranch.has(r.branch)) accessoriesByBranch.set(r.branch, new Set());
  accessoriesByBranch.get(r.branch)!.add(normalizeText(r.name).toLowerCase());
}
function isAccessoriesSa(branch: string, closeSaName: string): boolean {
  return accessoriesByBranch.get(branch)?.has(closeSaName.toLowerCase()) ?? false;
}

const { rows } = await pool.query<{ date: string; branch: string; row_data: Record<string, unknown> }>(
  `select date::text as date, branch, row_data
   from raw_upload_rows
   where report_type in ('service_info', 'service_info_bp')
     and date >= $1 and date <= $2`,
  [START_DATE, END_DATE]
);

// First pass: Close SA Name per (date, branch, RO) — needed to filter out
// accessories-staff ROs before counting their TGLOSS lines.
const closeSaByRo = new Map<string, string>();
for (const r of rows) {
  const ro = normalizeRo(r.row_data["Job Order No"]);
  if (!ro) continue;
  const key = `${r.date}|${r.branch}|${ro}`;
  if (!closeSaByRo.has(key)) closeSaByRo.set(key, normalizeText(r.row_data["Close Service Advisor Name"]));
}

const lineCountByDayBranch = new Map<string, number>();
const roSetByDayBranch = new Map<string, Set<string>>();

for (const r of rows) {
  const ro = normalizeRo(r.row_data["Job Order No"]);
  if (!ro) continue;
  const jobCode = normalizeText(r.row_data["Job Code"]);
  if (!TGLOSS_CODES.has(jobCode)) continue;
  const key = `${r.date}|${r.branch}|${ro}`;
  const closeSaName = closeSaByRo.get(key) ?? "";
  if (!closeSaName) continue;
  if (isAccessoriesSa(r.branch, closeSaName)) continue;

  const dbKey = `${r.date}|${r.branch}`;
  lineCountByDayBranch.set(dbKey, (lineCountByDayBranch.get(dbKey) ?? 0) + 1);
  if (!roSetByDayBranch.has(dbKey)) roSetByDayBranch.set(dbKey, new Set());
  roSetByDayBranch.get(dbKey)!.add(ro);
}

const branches = [...new Set([...lineCountByDayBranch.keys()].map((k) => k.split("|")[1]))].sort();

const lineMtdByBranch = new Map<string, number>();
const roMtdByBranch = new Map<string, number>();
for (const [key, lineCount] of lineCountByDayBranch) {
  const [, branch] = key.split("|");
  lineMtdByBranch.set(branch, (lineMtdByBranch.get(branch) ?? 0) + lineCount);
  roMtdByBranch.set(branch, (roMtdByBranch.get(branch) ?? 0) + (roSetByDayBranch.get(key)?.size ?? 0));
}

console.log(`=== MTD per branch, ${START_DATE}..${END_DATE} (TGLOSS line count vs distinct-RO count) ===`);
let totalLines = 0;
let totalRos = 0;
for (const branch of branches) {
  const lines = lineMtdByBranch.get(branch) ?? 0;
  const ros = roMtdByBranch.get(branch) ?? 0;
  totalLines += lines;
  totalRos += ros;
  console.log(`${branch}  lines=${lines}  distinctROs=${ros}`);
}
console.log(`\nCompany-wide MTD: lines=${totalLines}  distinctROs=${totalRos}`);

console.log(`\n=== Per day / per branch (line count), ${START_DATE}..${END_DATE} ===`);
const days = [...new Set([...lineCountByDayBranch.keys()].map((k) => k.split("|")[0]))].sort();
for (const day of days) {
  const parts: string[] = [];
  for (const branch of branches) {
    const lines = lineCountByDayBranch.get(`${day}|${branch}`);
    if (lines) parts.push(`${branch}=${lines}`);
  }
  if (parts.length) console.log(`${day}: ${parts.join(", ")}`);
}

await pool.end();
