// Check only — no writes. For Oct 1 through today, among ROs NOT closed by
// an accessories-staff SA (accessories_staff table) that have at least one
// TGLOSS job code (VAS_PRICE_BY_JOB_CODE — same "pitched" definition as
// close-sa-analytics/compute.ts's tglossPitchedRoCount), compares counting
// by distinct RO vs counting by distinct VIN: per day and per branch, plus
// MTD per branch and company-wide.
import "./load-env.mjs";
import { pool } from "../src/lib/db";
import { VAS_PRICE_BY_JOB_CODE } from "../src/lib/vas-price-list";

const START_DATE = "2026-10-01";
const END_DATE = "2026-10-24";

const TGLOSS_CODES = new Set([...VAS_PRICE_BY_JOB_CODE.keys()]);

function normalizeRo(value: unknown): string {
  return String(value ?? "").trim().replace(/-/g, "").toUpperCase();
}
function normalizeSaName(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function normalizeForMatch(value: string): string {
  return value.toLowerCase();
}
function normalizeVin(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

type RoRow = {
  date: string;
  branch: string;
  closeSaName: string;
  vin: string;
  hasTgloss: boolean;
};

const { rows: staffRows } = await pool.query<{ branch: string; name: string }>(
  `select branch, name from accessories_staff`
);
const accessoriesByBranch = new Map<string, Set<string>>();
for (const r of staffRows) {
  const key = r.branch;
  if (!accessoriesByBranch.has(key)) accessoriesByBranch.set(key, new Set());
  accessoriesByBranch.get(key)!.add(normalizeForMatch(normalizeSaName(r.name)));
}
function isAccessoriesSa(branch: string, closeSaName: string): boolean {
  const set = accessoriesByBranch.get(branch);
  if (!set) return false;
  return set.has(normalizeForMatch(closeSaName));
}

const { rows } = await pool.query<{ date: string; branch: string; row_data: Record<string, unknown> }>(
  `select date::text as date, branch, row_data
   from raw_upload_rows
   where report_type in ('service_info', 'service_info_bp')
     and date >= $1 and date <= $2`,
  [START_DATE, END_DATE]
);

// Group every job-code row onto its (date, branch, RO) — RO-level fields
// (Close SA, Vin) repeat per line; TGLOSS-ness is OR'd across lines.
const roMap = new Map<string, RoRow>();
let blankSaRows = 0;
let blankRoRows = 0;

for (const r of rows) {
  const ro = normalizeRo(r.row_data["Job Order No"]);
  if (!ro) {
    blankRoRows++;
    continue;
  }
  const key = `${r.date}|${r.branch}|${ro}`;
  let entry = roMap.get(key);
  if (!entry) {
    const closeSaName = normalizeSaName(r.row_data["Close Service Advisor Name"]);
    entry = { date: r.date, branch: r.branch, closeSaName, vin: normalizeVin(r.row_data["Vin no"]), hasTgloss: false };
    roMap.set(key, entry);
  }
  const jobCode = normalizeSaName(r.row_data["Job Code"]);
  if (TGLOSS_CODES.has(jobCode)) entry.hasTgloss = true;
}

// Qualifying ROs: has TGLOSS, has a Close SA name, and that SA is not on
// the accessories roster for its branch.
const qualifying: RoRow[] = [];
for (const entry of roMap.values()) {
  if (!entry.hasTgloss) continue;
  if (!entry.closeSaName) {
    blankSaRows++;
    continue;
  }
  if (isAccessoriesSa(entry.branch, entry.closeSaName)) continue;
  qualifying.push(entry);
}

// --- Per day, per branch ---
type DayBranchKey = string; // date|branch
const roCountByDayBranch = new Map<DayBranchKey, number>();
const vinSetByDayBranch = new Map<DayBranchKey, Set<string>>();
for (const r of qualifying) {
  const key = `${r.date}|${r.branch}`;
  roCountByDayBranch.set(key, (roCountByDayBranch.get(key) ?? 0) + 1);
  if (!vinSetByDayBranch.has(key)) vinSetByDayBranch.set(key, new Set());
  if (r.vin) vinSetByDayBranch.get(key)!.add(r.vin);
}

const branches = [...new Set(qualifying.map((r) => r.branch))].sort();
const days = [...new Set(qualifying.map((r) => r.date))].sort();

console.log(`=== Per day / per branch (RO count vs distinct VIN count), ${START_DATE}..${END_DATE} ===`);
let anyDayDiff = false;
for (const day of days) {
  for (const branch of branches) {
    const key = `${day}|${branch}`;
    const roCount = roCountByDayBranch.get(key) ?? 0;
    const vinCount = vinSetByDayBranch.get(key)?.size ?? 0;
    if (roCount === 0) continue;
    const diff = roCount !== vinCount;
    if (diff) anyDayDiff = true;
    console.log(`${day}  ${branch}  RO=${roCount}  VIN=${vinCount}${diff ? "  <-- DIFFERENT" : ""}`);
  }
}
if (!anyDayDiff) console.log("(no day/branch cell shows a RO vs VIN difference)");

// --- MTD per branch ---
const roCountMtdByBranch = new Map<string, number>();
const vinSetMtdByBranch = new Map<string, Set<string>>();
for (const r of qualifying) {
  roCountMtdByBranch.set(r.branch, (roCountMtdByBranch.get(r.branch) ?? 0) + 1);
  if (!vinSetMtdByBranch.has(r.branch)) vinSetMtdByBranch.set(r.branch, new Set());
  if (r.vin) vinSetMtdByBranch.get(r.branch)!.add(r.vin);
}

console.log(`\n=== MTD per branch (${START_DATE}..${END_DATE}) ===`);
let totalRo = 0;
const vinSetCompany = new Set<string>();
for (const branch of branches) {
  const roCount = roCountMtdByBranch.get(branch) ?? 0;
  const vinCount = vinSetMtdByBranch.get(branch)?.size ?? 0;
  totalRo += roCount;
  for (const v of vinSetMtdByBranch.get(branch) ?? []) vinSetCompany.add(v);
  const diff = roCount !== vinCount;
  console.log(`${branch}  RO=${roCount}  VIN=${vinCount}${diff ? `  <-- DIFFERENT (${roCount - vinCount} more ROs than VINs)` : ""}`);
}

console.log(`\n=== Company-wide MTD ===`);
console.log(`RO=${totalRo}  VIN=${vinSetCompany.size}${totalRo !== vinSetCompany.size ? `  <-- DIFFERENT (${totalRo - vinSetCompany.size} more ROs than VINs)` : ""}`);

console.log(`\n(data-quality notes: ${blankRoRows} rows with no Job Order No skipped entirely; ${blankSaRows} TGLOSS ROs skipped for having no Close SA Name)`);

// --- Repeat-VIN detail: for each (branch, VIN) with >1 distinct qualifying
// RO in the period, list the ROs/dates — confirms the RO-vs-VIN gap is
// genuine repeat visits, not a data artifact (dup rows, blank VINs, etc).
type RoKey = string; // date|branch|ro
const rosByBranchVin = new Map<string, { date: string; ro: string }[]>();
for (const [key, entry] of roMap) {
  if (!entry.hasTgloss) continue;
  if (!entry.closeSaName) continue;
  if (isAccessoriesSa(entry.branch, entry.closeSaName)) continue;
  if (!entry.vin) continue;
  const ro = key.split("|")[2];
  const bvKey = `${entry.branch}|${entry.vin}`;
  if (!rosByBranchVin.has(bvKey)) rosByBranchVin.set(bvKey, []);
  rosByBranchVin.get(bvKey)!.push({ date: entry.date, ro });
}

console.log(`\n=== Repeat VINs (same VIN, >1 distinct qualifying RO, ${START_DATE}..${END_DATE}) ===`);
let repeatVinCount = 0;
let extraRoFromRepeats = 0;
const repeatRowsSorted = [...rosByBranchVin.entries()]
  .filter(([, list]) => list.length > 1)
  .sort((a, b) => b[1].length - a[1].length);
for (const [bvKey, list] of repeatRowsSorted) {
  repeatVinCount++;
  extraRoFromRepeats += list.length - 1;
  const [branch, vin] = bvKey.split("|");
  const detail = list
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => `${r.date}:${r.ro}`)
    .join(", ");
  console.log(`${branch}  VIN=${vin}  ROs=${list.length}  [${detail}]`);
}
console.log(`\n${repeatVinCount} VINs repeated, accounting for ${extraRoFromRepeats} extra ROs (should match the company-wide RO-VIN gap above).`);

// --- Account for the rest of the gap: qualifying ROs with a blank VIN
// never land in any VIN set, so each one widens the RO-vs-VIN gap by 1
// without being a "repeat".
let blankVinQualifying = 0;
const blankVinList: string[] = [];
for (const [key, entry] of roMap) {
  if (!entry.hasTgloss) continue;
  if (!entry.closeSaName) continue;
  if (isAccessoriesSa(entry.branch, entry.closeSaName)) continue;
  if (!entry.vin) {
    blankVinQualifying++;
    blankVinList.push(key);
  }
}
console.log(`\n=== Qualifying ROs with a blank VIN (count toward RO total, never toward any VIN) ===`);
console.log(`${blankVinQualifying} such ROs: ${blankVinList.join(", ") || "(none)"}`);
console.log(`\nGap check: ${extraRoFromRepeats} (repeats) + ${blankVinQualifying} (blank VIN) = ${extraRoFromRepeats + blankVinQualifying} (should equal the company-wide RO-VIN gap)`);

// --- Cross-branch repeats: same VIN, qualifying RO in two+ DIFFERENT
// branches — invisible to the per-branch repeat list above (each branch
// only sees 1 RO for it), but still collapses to 1 VIN in the company-wide
// dedup, which is where the rest of the gap comes from.
const rosByVinAcrossBranches = new Map<string, { date: string; branch: string; ro: string }[]>();
for (const [key, entry] of roMap) {
  if (!entry.hasTgloss) continue;
  if (!entry.closeSaName) continue;
  if (isAccessoriesSa(entry.branch, entry.closeSaName)) continue;
  if (!entry.vin) continue;
  const ro = key.split("|")[2];
  if (!rosByVinAcrossBranches.has(entry.vin)) rosByVinAcrossBranches.set(entry.vin, []);
  rosByVinAcrossBranches.get(entry.vin)!.push({ date: entry.date, branch: entry.branch, ro });
}
console.log(`\n=== Cross-branch repeats (same VIN, qualifying RO at >1 different branch) ===`);
let crossBranchVins = 0;
for (const [vin, list] of rosByVinAcrossBranches) {
  const branchesForVin = new Set(list.map((r) => r.branch));
  if (branchesForVin.size <= 1) continue;
  crossBranchVins++;
  const detail = list
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => `${r.date}:${r.branch}:${r.ro}`)
    .join(", ");
  console.log(`VIN=${vin}  [${detail}]`);
}
console.log(`\n${crossBranchVins} VINs span >1 branch.`);

await pool.end();
