import * as XLSX from "xlsx";
import { formatPercent } from "./format";
import { REGIONS, type RegionName } from "./regions";
import type { Report, BranchReport } from "./report";
import { buildReport } from "./report";
import { branchName } from "./branch-names";
import { DAILY_REPORT_ROWS, branchCell, regionTotalCell, type MetricDef, type RowDef, type ReportCell } from "@/app/dashboard/daily-report-rows";

/**
 * Daily "fill in the gaps" Excel template for branches (2026-10-23, at the
 * user's request, modelled on their own "Revenue Streams" workbook — a
 * compact Daily Summary tab plus a full per-branch Daily Detail tab).
 * Everything DAILY_REPORT_ROWS already tracks is pre-filled, reusing its
 * exact branchCell/regionTotalCell math so this can never drift from the
 * live dashboard; a short list of shop-floor metrics we don't capture
 * anywhere (see UNTRACKED_LABELS) are left as blank label-only rows for a
 * branch to fill by hand after downloading.
 */

const REGION_ORDER: RegionName[] = ["Central", "South", "North"];

/** CO01C (online store) has no column of its own — its figures are already
 * folded into CO01A's, same convention as every other region-branch list in
 * the app (see regions.ts/report.ts's ONLINE_STORE_PARENT_BRANCH). */
function regionBranchCodes(region: RegionName): string[] {
  return REGIONS[region].filter((b) => b !== "CO01C");
}

type Col = { kind: "branch"; branch: string } | { kind: "regionTotal"; region: RegionName } | { kind: "spacer" } | { kind: "groupTotal" };

function buildColumns(): Col[] {
  const cols: Col[] = [];
  for (const region of REGION_ORDER) {
    for (const branch of regionBranchCodes(region)) cols.push({ kind: "branch", branch });
    cols.push({ kind: "regionTotal", region });
    cols.push({ kind: "spacer" });
  }
  cols.push({ kind: "groupTotal" });
  return cols;
}

function headerLabel(col: Col): string {
  if (col.kind === "branch") return col.branch;
  if (col.kind === "regionTotal") return `${col.region} Total`;
  if (col.kind === "groupTotal") return "Group Total";
  return "";
}

function subHeaderLabel(col: Col): string {
  return col.kind === "branch" ? branchName(col.branch) : "";
}

function byBranchMap(report: Report): Map<string, BranchReport> {
  return new Map(report.branches.map((b) => [b.branch, b]));
}

const EMPTY_CELL: ReportCell = { today: null, mtd: null, target: null, ratio: null, display: null };

function cellFor(col: Col, def: MetricDef, byBranch: Map<string, BranchReport>, report: Report): ReportCell {
  if (col.kind === "spacer") return EMPTY_CELL;
  if (col.kind === "branch") {
    const b = byBranch.get(col.branch);
    return b ? branchCell(def, b) : EMPTY_CELL;
  }
  const branches =
    col.kind === "regionTotal"
      ? regionBranchCodes(col.region)
          .map((code) => byBranch.get(code))
          .filter((b): b is BranchReport => b !== undefined)
      : report.branches;
  return regionTotalCell(def, branches);
}

/** Mutable row accumulator for one sheet — tracks which row indices are
 * percentage-formatted so toSheet() can apply "0.0%" after the fact (the
 * community SheetJS build this app already uses elsewhere has no cell-style
 * API beyond number formats — see api/vp/slab-targets-export/route.ts). */
function sheetBuilder() {
  const aoa: (string | number)[][] = [];
  const percentRows = new Set<number>();
  return {
    push(row: (string | number)[], isPercent = false) {
      if (isPercent) percentRows.add(aoa.length);
      aoa.push(row);
    },
    blank() {
      aoa.push([]);
    },
    aoa,
    percentRows,
  };
}
type SheetBuilder = ReturnType<typeof sheetBuilder>;

function sheetHeaderRows(cols: Col[], report: Report): (string | number)[][] {
  return [
    ["Nippon Group — Revenue Stream Daily Report"],
    [`As of ${report.date}`],
    ["Metric", ...cols.map(headerLabel)],
    ["", ...cols.map(subHeaderLabel)],
  ];
}

function pushMetricRows(sb: SheetBuilder, def: MetricDef, cols: Col[], byBranch: Map<string, BranchReport>, report: Report) {
  const isPercentMetric = def.fmt === formatPercent;
  const cells = cols.map((col) => cellFor(col, def, byBranch, report));
  if (cells.some((c) => c.today !== null)) sb.push([`${def.label} — Today`, ...cells.map((c) => c.today ?? "")], isPercentMetric);
  if (cells.some((c) => c.mtd !== null)) sb.push([`${def.label} — MTD`, ...cells.map((c) => c.mtd ?? "")], isPercentMetric);
  if (cells.some((c) => c.target !== null)) sb.push([`${def.label} — Target`, ...cells.map((c) => c.target ?? "")], isPercentMetric);
  if (cells.some((c) => c.ratio !== null)) sb.push([`${def.label} — Ach %`, ...cells.map((c) => c.ratio ?? "")], true);
}

function buildSection(rowDefs: RowDef[], sb: SheetBuilder, cols: Col[], byBranch: Map<string, BranchReport>, report: Report) {
  for (const row of rowDefs) {
    if (row.kind === "group") {
      sb.blank();
      sb.push([row.label.toUpperCase()]);
      continue;
    }
    pushMetricRows(sb, row, cols, byBranch, report);
  }
}

function findMetric(label: string): MetricDef {
  const found = DAILY_REPORT_ROWS.find((r): r is MetricDef => r.kind === "metric" && r.label === label);
  if (!found) throw new Error(`revenue-stream-export: metric not found — ${label}`);
  return found;
}

/** The compact "Daily Summary" tab — GUS/BPU/Revenue Stream/TGLOSS only,
 * same rows as the user's own Sheet1 pivot. Picked explicitly by label
 * (not filtered out of DAILY_REPORT_ROWS) since Sheet1's own grouping
 * ("Total MTD" sits under "Scrap & Used Oil" there) doesn't carry over. */
const SUMMARY_ROWS: RowDef[] = [
  { kind: "group", label: "GUS" },
  findMetric("GUS RO"),
  findMetric("GUS Parts MTD (Rs)"),
  findMetric("GUS Labour MTD (Rs)"),
  { kind: "group", label: "BPU" },
  findMetric("BPU RO"),
  findMetric("BPU Parts MTD (Rs)"),
  findMetric("BPU Labour MTD (Rs)"),
  { kind: "group", label: "Revenue Stream" },
  findMetric("External Sales MTD (Rs)"),
  findMetric("% on SPR I"),
  findMetric("Total MTD (Rs)"),
  { kind: "group", label: "TGLOSS" },
  findMetric("TGLOSS"),
  findMetric("TGLOSS Gentani (Rs/RO)"),
];

/** Shop-floor metrics the user's workbook tracks that nothing in our upload
 * pipeline captures (confirmed 2026-10-23 against report.ts, vas-price-list.ts
 * and the Service Info/Part Sale parsers) — label-only rows, blank for a
 * branch to fill in after downloading. */
const UNTRACKED_LABELS = [
  "T Club",
  "Extended Warranty",
  "Smiles",
  "GR → BP Conversion Revenue (Rs)",
  "GR → BP Conversion Count",
  "Unique VIN VAS",
  "Total Car Care Treatments (excl. Mech Care)",
  "TP-TP",
  "NTP-TP",
  "TGLOSS Mech Care Penetration",
];

function buildUntrackedSection(sb: SheetBuilder, cols: Col[]) {
  sb.blank();
  sb.push(["MANUAL ENTRY — NOT TRACKED BY THE DASHBOARD (fill in by hand)"]);
  for (const label of UNTRACKED_LABELS) {
    sb.push([`${label} — Today`, ...cols.map(() => "")]);
    sb.push([`${label} — MTD`, ...cols.map(() => "")]);
  }
}

function improvementRow(cols: Col[], label: string, thisReport: Report, baseReport: Report): (string | number)[] {
  const totalDef = findMetric("Total MTD (Rs)");
  const thisByBranch = byBranchMap(thisReport);
  const baseByBranch = byBranchMap(baseReport);
  const row: (string | number)[] = [label];
  for (const col of cols) {
    const thisVal = cellFor(col, totalDef, thisByBranch, thisReport).mtd;
    const baseVal = cellFor(col, totalDef, baseByBranch, baseReport).mtd;
    row.push(thisVal === null || baseVal === null || baseVal === 0 ? "" : (thisVal - baseVal) / baseVal);
  }
  return row;
}

function buildComparisonSection(
  sb: SheetBuilder,
  cols: Col[],
  report: Report,
  lastMonthReport: Report | null,
  lastYearReport: Report | null
) {
  const totalDef = findMetric("Total MTD (Rs)");
  sb.blank();
  sb.push(["COMPARISON — TOTAL REVENUE STREAM MTD (Rs)"]);
  const byBranch = byBranchMap(report);
  sb.push([`${report.date} — Total MTD (Rs)`, ...cols.map((col) => cellFor(col, totalDef, byBranch, report).mtd ?? "")]);

  if (lastMonthReport) {
    const lmByBranch = byBranchMap(lastMonthReport);
    sb.push([
      `Same date last month (${lastMonthReport.date}) — Total MTD (Rs)`,
      ...cols.map((col) => cellFor(col, totalDef, lmByBranch, lastMonthReport).mtd ?? ""),
    ]);
    sb.push(improvementRow(cols, "Improvement over last month %", report, lastMonthReport), true);
  }

  if (lastYearReport) {
    const lyByBranch = byBranchMap(lastYearReport);
    sb.push([
      `Same date last year (${lastYearReport.date}) — Total MTD (Rs)`,
      ...cols.map((col) => cellFor(col, totalDef, lyByBranch, lastYearReport).mtd ?? ""),
    ]);
    sb.push(improvementRow(cols, "Improvement over last year %", report, lastYearReport), true);
  }
}

function toSheet(aoa: (string | number)[][], percentRows: Set<number>, totalCols: number): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = Array.from({ length: totalCols }, (_, i) => ({ wch: i === 0 ? 42 : 14 }));
  for (const r of percentRows) {
    for (let c = 1; c < totalCols; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = "0.0%";
    }
  }
  return sheet;
}

export type RevenueStreamWorkbookInput = {
  report: Report;
  lastMonthReport: Report | null;
  lastYearReport: Report | null;
};

export function buildRevenueStreamWorkbook(input: RevenueStreamWorkbookInput): XLSX.WorkBook {
  const { report, lastMonthReport, lastYearReport } = input;
  const cols = buildColumns();
  const byBranch = byBranchMap(report);
  const totalCols = cols.length + 1;

  const summarySb = sheetBuilder();
  for (const row of sheetHeaderRows(cols, report)) summarySb.push(row);
  buildSection(SUMMARY_ROWS, summarySb, cols, byBranch, report);
  buildComparisonSection(summarySb, cols, report, lastMonthReport, lastYearReport);

  const detailSb = sheetBuilder();
  for (const row of sheetHeaderRows(cols, report)) detailSb.push(row);
  buildSection(DAILY_REPORT_ROWS, detailSb, cols, byBranch, report);
  buildUntrackedSection(detailSb, cols);
  buildComparisonSection(detailSb, cols, report, lastMonthReport, lastYearReport);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, toSheet(summarySb.aoa, summarySb.percentRows, totalCols), "Daily Summary");
  XLSX.utils.book_append_sheet(workbook, toSheet(detailSb.aoa, detailSb.percentRows, totalCols), "Daily Detail");
  return workbook;
}

/** Same calendar day N months earlier/later, clamped to the shorter month's
 * last day (e.g. Mar 31 → Feb 28/29) — a standalone copy of vp-data.ts's own
 * sameDayLastMonth (not exported there) generalised to any month offset. */
function shiftMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const totalMonths = y * 12 + (m - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d, daysInTargetMonth);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

export const sameDayLastMonth = (date: string): string => shiftMonths(date, -1);
export const sameDayLastYear = (date: string): string => shiftMonths(date, -12);

/** Builds today's report plus the two comparison reports (same date last
 * month / last year, each best-effort — a missing one just drops its rows)
 * and assembles the full workbook. Null when there's no report at all for
 * `date` (mirrors every other export route's 404 case). */
export async function loadRevenueStreamWorkbook(date: string): Promise<{ workbook: XLSX.WorkBook; report: Report } | null> {
  const report = await buildReport(date);
  if (!report) return null;
  const [lastMonthReport, lastYearReport] = await Promise.all([buildReport(sameDayLastMonth(date)), buildReport(sameDayLastYear(date))]);
  const workbook = buildRevenueStreamWorkbook({ report, lastMonthReport, lastYearReport });
  return { workbook, report };
}
