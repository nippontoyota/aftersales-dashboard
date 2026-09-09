// One-off: does our dashboard reproduce the figures the "Revenue Stream VP View"
// pulls from the "Revenue streams 4th Sep 2026.xlsx" workbook (its "Sep 04"
// sheet)?  Prints a per-metric group-total comparison + per-branch diffs.
//   npx tsx scripts/compare-vpview-sep04.mts
import "./load-env.mjs";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildReport } from "../src/lib/report";
import { computeHeroSummary, computeKpiSummary } from "../src/lib/aggregate";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DATE = process.argv[2] || "2026-09-03";
const SHEET = process.argv[3] || "Sep 03";
const XLSX_PATH =
  "C:/Users/Nippon/AppData/Local/Temp/claude/D--aftersales-intelligence-dashboard/84189a56-09c3-42e2-852e-1e5424f8b574/scratchpad/rs4sep.xlsx";

const wb = XLSX.read(readFileSync(XLSX_PATH), { type: "buffer" });
const sep = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], { header: 1, defval: "", raw: true }) as unknown[][];

// column index in the Sep 04 sheet for each branch code + the Total column
const COL: Record<string, number> = {
  CO01A: 3, CO01B: 4, MV01A: 5, KY01A: 6,
  TR01A: 9, TR01B: 10, TR01C: 11, KL01A: 12, KL01B: 13, PH01A: 14,
  TL01A: 17, KT01A: 18, KT01B: 19, TI01A: 20, IR01A: 21, TI01B: 22, TI01C: 23,
  TOTAL: 26,
};
// sheet row index (0-based) for each label we need
function rowByLabel(label: string): number {
  const i = sep.findIndex((r) => String(r[0] ?? "").trim() === label);
  if (i === -1) throw new Error(`row not found: ${label}`);
  return i;
}
const R = {
  gusRoDay: rowByLabel("GUS RO billed for the day"),
  gusRoMtd: rowByLabel("GUS RO-  MTD"),
  gusPartsMtd: rowByLabel("GUS Parts- MTD   (Rs)"),
  gusLabourMtd: rowByLabel("GUS Labour- MTD   (Rs)"),
  bpuRoDay: rowByLabel("BPU RO billed for the day"),
  bpuRoMtd: rowByLabel("BPU RO-  MTD"),
  bpuPartsMtd: rowByLabel("BPU Parts- MTD  (Rs)"),
  bpuLabourMtd: rowByLabel("BPU Labour- MTD  (Rs)"),
  extSalesMtd: rowByLabel("External Sales- MTD"),
  totalMtd: rowByLabel("Total  MTD (Rs)"),
  vasBillTarget: rowByLabel("VAS bill-Target"),
};
// "Achvmnt for the month" appears many times; the VAS bill one is right after VAS bill-Target
const vasBillAchvRow = R.vasBillTarget + 1;

function sheetVal(row: number, code: string): number | null {
  const v = sep[row]?.[COL[code]];
  return typeof v === "number" ? v : v === "" || v == null ? null : Number(v);
}

const report = await buildReport(DATE);
if (!report) throw new Error("no report for " + DATE);
const hero = computeHeroSummary(report.branches);
const kpi = computeKpiSummary(report.branches);
const byBranch = new Map(report.branches.map((b) => [b.branch, b]));

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("en-IN") : String(Math.round(n * 100) / 100);

type Metric = {
  name: string;
  sheetRow: number;
  ours: (code: string) => number | null;
  heroTotal: number | null;
};

const metrics: Metric[] = [
  { name: "GUS RO billed / day", sheetRow: R.gusRoDay, ours: (c) => byBranch.get(c)?.gusRoBilledForTheDay ?? null, heroTotal: hero.gusRoBilledForTheDay },
  { name: "GUS RO MTD", sheetRow: R.gusRoMtd, ours: (c) => byBranch.get(c)?.gusRoMtd ?? null, heroTotal: hero.gusRoMtd },
  { name: "GUS Parts MTD", sheetRow: R.gusPartsMtd, ours: (c) => byBranch.get(c)?.gusPartsMtd ?? null, heroTotal: hero.gusPartsMtd },
  { name: "GUS Labour MTD", sheetRow: R.gusLabourMtd, ours: (c) => byBranch.get(c)?.gusLabourMtd ?? null, heroTotal: hero.gusLabourMtd },
  { name: "BPU RO billed / day", sheetRow: R.bpuRoDay, ours: (c) => byBranch.get(c)?.bpuRoBilledForTheDay ?? null, heroTotal: hero.bpuRoBilledForTheDay },
  { name: "BPU RO MTD", sheetRow: R.bpuRoMtd, ours: (c) => byBranch.get(c)?.bpuRoMtd ?? null, heroTotal: hero.bpuRoMtd },
  { name: "BPU Parts MTD", sheetRow: R.bpuPartsMtd, ours: (c) => byBranch.get(c)?.bpuPartsMtd ?? null, heroTotal: hero.bpuPartsMtd },
  { name: "BPU Labour MTD", sheetRow: R.bpuLabourMtd, ours: (c) => byBranch.get(c)?.bpuLabourMtd ?? null, heroTotal: hero.bpuLabourMtd },
  { name: "External Sales MTD", sheetRow: R.extSalesMtd, ours: (c) => byBranch.get(c)?.externalSalesMtd ?? null, heroTotal: hero.externalSalesMtd },
  { name: "VAS bill (3M+DB) MTD", sheetRow: vasBillAchvRow, ours: (c) => byBranch.get(c)?.vasAchievementForTheMonth ?? null, heroTotal: kpi.vasAchievementForTheMonth },
  { name: "VAS bill Target", sheetRow: R.vasBillTarget, ours: (c) => byBranch.get(c)?.vasBillTarget ?? null, heroTotal: kpi.vasBillTarget },
  { name: "Total Revenue MTD", sheetRow: R.totalMtd, ours: (c) => byBranch.get(c)?.totalRevenueStreamMtd ?? null, heroTotal: hero.totalRevenueStreamMtd },
];

console.log(`\n=== GROUP TOTAL: our dashboard (${DATE}) vs workbook sheet ===\n`);
console.log("metric".padEnd(24), "ours".padStart(16), "sheet".padStart(16), "diff".padStart(14));
for (const m of metrics) {
  const s = sheetVal(m.sheetRow, "TOTAL");
  const o = m.heroTotal;
  const diff = o != null && s != null ? o - s : null;
  const flag = diff != null && Math.abs(diff) > 1 ? "  <-- DIFF" : "";
  console.log(m.name.padEnd(24), fmt(o).padStart(16), fmt(s).padStart(16), fmt(diff).padStart(14), flag);
}

console.log(`\n=== PER-BRANCH DIFFS (only |diff| > 1 shown) ===`);
const codes = Object.keys(COL).filter((c) => c !== "TOTAL");
for (const m of metrics) {
  const lines: string[] = [];
  for (const code of codes) {
    const s = sheetVal(m.sheetRow, code);
    const o = m.ours(code);
    if (o == null && s == null) continue;
    if (o == null || s == null) { lines.push(`   ${code.padEnd(7)} ours=${fmt(o)}  sheet=${fmt(s)}  (one side missing)`); continue; }
    const d = o - s;
    if (Math.abs(d) > 1) lines.push(`   ${code.padEnd(7)} ours=${fmt(o).padStart(14)}  sheet=${fmt(s).padStart(14)}  diff=${fmt(d).padStart(12)}`);
  }
  if (lines.length) { console.log(`\n${m.name}:`); lines.forEach((l) => console.log(l)); }
}

// branch presence check
const ourCodes = new Set(report.branches.map((b) => b.branch));
const sheetCodes = codes.filter((c) => sep[R.gusRoMtd]?.[COL[c]] !== "" || sep[R.bpuRoMtd]?.[COL[c]] !== "");
console.log(`\n=== BRANCH COVERAGE ===`);
console.log("in sheet, not in our report:", sheetCodes.filter((c) => !ourCodes.has(c)).join(", ") || "(none)");
console.log("in our report, not in sheet columns:", [...ourCodes].filter((c) => !(c in COL)).join(", ") || "(none)");

process.exit(0);
