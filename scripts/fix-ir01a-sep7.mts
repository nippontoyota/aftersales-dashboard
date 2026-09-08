// One-off: IR01A uploaded the month-cumulative "SEP 2026" export as its
// 7 Sep snapshot (identical to 3 Sep) — double-counting Sept 1-3 across the
// summed reports and freezing scom205 at 3 Sep. The branch has the correct
// single-day "SEP 07" files; this replaces the 7 Sep snapshots + raw rows
// with those, using the exact same parsers/stores the upload routes use.
// The 3 Sep snapshot (the real Sept 1-3) is left untouched. 4-6 Sep are
// still owed by the branch.
//
//   npx tsx scripts/fix-ir01a-sep7.mts [--commit]
import fs from "node:fs";
import "./load-env.mjs";
import { parseServiceInfoWorkbook } from "../src/lib/service-info/parse";
import { parseSsrv089Workbook } from "../src/lib/ssrv089/parse";
import { parsePartSaleWorkbook } from "../src/lib/part-sale/parse";
import { parseScom205Workbook } from "../src/lib/scom205/parse";
import { saveServiceInfoSnapshot } from "../src/lib/service-info/store";
import { saveSsrv089Snapshot } from "../src/lib/ssrv089/store";
import { savePartSaleSnapshot } from "../src/lib/part-sale/store";
import { saveScom205Snapshot } from "../src/lib/scom205/store";
import { saveRawUploadRows } from "../src/lib/raw-upload-rows/store";
import { saveRawReportUpload } from "../src/lib/raw-report-uploads/store";
import { listAccessoriesStaffNamesForBranch } from "../src/lib/accessories-staff-store";
import { pool } from "../src/lib/db";

const COMMIT = process.argv.includes("--commit");
const BRANCH = "IR01A";
const DATE = "2026-09-07";
const DIR = "C:/Users/Nippon/Downloads";
const F = {
  siGs: `${DIR}/Service_Info_Report-IR01A-GS SEP 07_1.csv`,
  siBp: `${DIR}/Service_Info_Report-IR01A-BP SEP 07_1.csv`,
  ssGs: `${DIR}/SSRV089_CostAndSalesReport-GS SEP 07_1.csv`,
  ssBp: `${DIR}/SSRV089_CostAndSalesReport-BP SEP 07_1.csv`,
  ps: `${DIR}/SPRT014_PartSaleReport-SEP 07_1.csv`,
  scom: `${DIR}/Monthly KPI Report_SEP 07.xls`,
};

const read = (p: string) => fs.readFileSync(p);
const base = (p: string) => p.split("/").pop()!;

const staff = await listAccessoriesStaffNamesForBranch(BRANCH);
console.log(`${BRANCH} accessories roster: ${staff.join(", ") || "(none)"}\n`);

const si = parseServiceInfoWorkbook(read(F.siGs), BRANCH, staff);
const ss = parseSsrv089Workbook(read(F.ssGs), staff);
const ps = parsePartSaleWorkbook(read(F.ps));
const scom = parseScom205Workbook(read(F.scom));

console.log("Parsed from the correct SEP 07 daily files:");
console.log("  service_info :", JSON.stringify(si.counts));
console.log("  ssrv089-gen  :", JSON.stringify(ss.totals));
console.log("  part_sale    :", JSON.stringify(ps.counts));
console.log("  scom205      :", JSON.stringify(scom.totals));
console.log("  service_info_bp / ssrv089_bp: raw file stored, nothing parsed\n");

if (!COMMIT) {
  console.log("Dry run — re-run with --commit to write.");
  await pool.end();
  process.exit(0);
}

const at = new Date().toISOString();

await saveServiceInfoSnapshot({ date: DATE, branch: BRANCH, uploadedAt: at, sourceFileName: base(F.siGs), counts: si.counts });
await saveRawUploadRows({ reportType: "service_info", date: DATE, uploadedAt: at, sourceFileName: base(F.siGs), rows: si.rawRows.map((data) => ({ branch: BRANCH, data })) });

await saveSsrv089Snapshot({ date: DATE, branch: BRANCH, variant: "general", uploadedAt: at, sourceFileName: base(F.ssGs), totals: ss.totals });
await saveRawUploadRows({ reportType: "ssrv089", date: DATE, uploadedAt: at, sourceFileName: base(F.ssGs), rows: ss.rawRows.map((data) => ({ branch: BRANCH, data })) });

await savePartSaleSnapshot({ date: DATE, branch: BRANCH, uploadedAt: at, sourceFileName: base(F.ps), counts: ps.counts });
await saveRawUploadRows({ reportType: "part_sale", date: DATE, uploadedAt: at, sourceFileName: base(F.ps), rows: ps.rawRows.map((data) => ({ branch: BRANCH, data })) });

await saveScom205Snapshot({ date: DATE, branch: BRANCH, uploadedAt: at, sourceFileName: base(F.scom), totals: scom.totals });
await saveRawUploadRows({ reportType: "scom205", date: DATE, uploadedAt: at, sourceFileName: base(F.scom), rows: scom.rawRows.map((data) => ({ branch: BRANCH, data })) });

await saveRawReportUpload({ date: DATE, branch: BRANCH, reportType: "service_info_bp", uploadedAt: at, sourceFileName: base(F.siBp), fileData: read(F.siBp) });
await saveRawReportUpload({ date: DATE, branch: BRANCH, reportType: "ssrv089_bp", uploadedAt: at, sourceFileName: base(F.ssBp), fileData: read(F.ssBp) });

console.log("Committed — IR01A 7 Sep replaced with the correct daily files.");
await pool.end();
