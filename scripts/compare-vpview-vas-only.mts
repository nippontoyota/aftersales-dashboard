// VAS-only comparison: our dashboard (2026-09-13) vs "Revenue streams 12th
// Sep 2026.xlsx" (Sep 12 sheet) — same underlying business day, see
// compare-vpview-sep12.mts for why the dates are offset by one.
//   npx tsx scripts/compare-vpview-vas-only.mts
import "./load-env.mjs";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildReport } from "../src/lib/report";
import { computeKpiSummary } from "../src/lib/aggregate";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DATE = "2026-09-13";
const SHEET = "Sep 12";
const XLSX_PATH = "C:/Users/Nippon/Downloads/Revenue streams 12th Sep 2026.xlsx";

const wb = XLSX.read(readFileSync(XLSX_PATH), { type: "buffer" });
const sep = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], { header: 1, defval: "", raw: true }) as unknown[][];

const COL: Record<string, number> = {
  CO01A: 3, CO01B: 4, MV01A: 5, KY01A: 6,
  TR01A: 9, TR01B: 10, TR01C: 11, KL01A: 12, KL01B: 13, PH01A: 14,
  TL01A: 17, KT01A: 18, KT01B: 19, TI01A: 20, IR01A: 21, TI01B: 22, TI01C: 23,
  TOTAL: 26,
};
function rowByLabel(label: string): number {
  const i = sep.findIndex((r) => String(r[0] ?? "").trim() === label);
  if (i === -1) throw new Error(`row not found: ${label}`);
  return i;
}
const vasTargetRow = rowByLabel("VAS bill-Target");
const vasAchvRow = vasTargetRow + 1; // "Achvmnt for the month"
const vasPctRow = rowByLabel("VAS achvmnt %");
const vasGentaniRow = rowByLabel("VAS - Gentani");

function sheetVal(row: number, code: string): number | null {
  const v = sep[row]?.[COL[code]];
  return typeof v === "number" ? v : v === "" || v == null ? null : Number(v);
}

const report = await buildReport(DATE);
if (!report) throw new Error("no report for " + DATE);
const kpi = computeKpiSummary(report.branches);
const byBranch = new Map(report.branches.map((b) => [b.branch, b]));

const fmt = (n: number | null | undefined, pct = false) =>
  n == null ? "—" : pct ? `${(n * 100).toFixed(1)}%` : Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("en-IN") : String(Math.round(n * 100) / 100);

console.log(`\n=== VAS ONLY: our dashboard (${DATE}) vs workbook sheet "${SHEET}" ===\n`);
console.log(
  "branch".padEnd(8),
  "ours Target".padStart(14), "sheet Target".padStart(14),
  "ours MTD".padStart(14), "sheet MTD".padStart(14), "diff MTD".padStart(12),
  "ours %".padStart(8), "sheet %".padStart(8),
  "ours Gentani".padStart(14), "sheet Gentani".padStart(14),
);
const codes = Object.keys(COL).filter((c) => c !== "TOTAL");
for (const code of codes) {
  const b = byBranch.get(code);
  const oTarget = b?.vasBillTarget ?? null;
  const sTarget = sheetVal(vasTargetRow, code);
  const oMtd = b?.vasAchievementForTheMonth ?? null;
  const sMtd = sheetVal(vasAchvRow, code);
  const diffMtd = oMtd != null && sMtd != null ? oMtd - sMtd : null;
  const oPct = b?.vasAchievementPercent ?? null;
  const sPct = sheetVal(vasPctRow, code);
  const oGentani = b?.vasGentani ?? null;
  const sGentani = sheetVal(vasGentaniRow, code);
  console.log(
    code.padEnd(8),
    fmt(oTarget).padStart(14), fmt(sTarget).padStart(14),
    fmt(oMtd).padStart(14), fmt(sMtd).padStart(14), fmt(diffMtd).padStart(12),
    fmt(oPct, true).padStart(8), fmt(sPct, true).padStart(8),
    fmt(oGentani).padStart(14), fmt(sGentani).padStart(14),
  );
}
console.log(
  "TOTAL".padEnd(8),
  fmt(kpi.vasBillTarget).padStart(14), fmt(sheetVal(vasTargetRow, "TOTAL")).padStart(14),
  fmt(kpi.vasAchievementForTheMonth).padStart(14), fmt(sheetVal(vasAchvRow, "TOTAL")).padStart(14),
  fmt((kpi.vasAchievementForTheMonth ?? 0) - (sheetVal(vasAchvRow, "TOTAL") ?? 0)).padStart(12),
  "".padStart(8), "".padStart(8),
  "".padStart(14), "".padStart(14),
);

process.exit(0);
