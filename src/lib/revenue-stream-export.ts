import { Workbook, type Worksheet, type Row, type Borders } from "exceljs";
import { formatPercent } from "./format";
import { achievementTone } from "./aggregate";
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
 *
 * Switched from the `xlsx` package to ExcelJS (2026-10-23, at the user's
 * request, after confirming the Python-styling alternative would mean
 * standing up a second runtime just to format a spreadsheet) — ExcelJS can
 * write real cell styling (fills, borders, fonts, merges), which `xlsx`'s
 * free build can't (see the Incentive Slab Targets export's own comment).
 * Colours below reuse the app's own design tokens (globals.css) and
 * achievementTone()'s thresholds rather than inventing a new palette.
 */

const COLOR = {
  titleFill: "FFDC2626", // --color-accent
  titleText: "FFFFFFFF",
  headerFill: "FFCBD5E1", // --color-border-strong
  headerText: "FF0F172A", // --color-fg
  groupFill: "FFF1F5F9", // --color-surface-2
  groupText: "FF0F172A",
  warnBannerFill: "FFFFFBEB", // --color-warn-soft
  warnBannerText: "FFB45309", // --color-warn
  border: "FFCBD5E1", // --color-border-strong
  mutedText: "FF475569", // --color-fg-muted
  good: "FF047857",
  goodSoft: "FFECFDF5",
  warn: "FFB45309",
  warnSoft: "FFFFFBEB",
  bad: "FFB91C1C",
  badSoft: "FFFEF2F2",
} as const;

const THIN_BORDER: Partial<Borders> = {
  top: { style: "thin", color: { argb: COLOR.border } },
  left: { style: "thin", color: { argb: COLOR.border } },
  bottom: { style: "thin", color: { argb: COLOR.border } },
  right: { style: "thin", color: { argb: COLOR.border } },
};

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

// ---- styling helpers --------------------------------------------------

function addTitleRow(ws: Worksheet, text: string, totalCols: number): void {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, totalCols);
  const cell = row.getCell(1);
  cell.font = { bold: true, size: 14, color: { argb: COLOR.titleText } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.titleFill } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  row.height = 26;
}

function addSubtitleRow(ws: Worksheet, text: string, totalCols: number): void {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, totalCols);
  const cell = row.getCell(1);
  cell.font = { italic: true, color: { argb: COLOR.mutedText } };
  cell.alignment = { horizontal: "center" };
}

function addHeaderRows(ws: Worksheet, cols: Col[], totalCols: number): void {
  const row1 = ws.addRow(["Metric", ...cols.map(headerLabel)]);
  const row2 = ws.addRow(["", ...cols.map(subHeaderLabel)]);
  for (const row of [row1, row2]) {
    for (let c = 1; c <= totalCols; c++) {
      const cell = row.getCell(c);
      cell.font = { bold: true, color: { argb: COLOR.headerText } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerFill } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = THIN_BORDER;
    }
  }
  row1.height = 18;
}

function addGroupRow(ws: Worksheet, label: string, totalCols: number, variant: "default" | "warn" = "default"): void {
  const row = ws.addRow([label.toUpperCase()]);
  ws.mergeCells(row.number, 1, row.number, totalCols);
  const cell = row.getCell(1);
  const [fill, text] = variant === "warn" ? [COLOR.warnBannerFill, COLOR.warnBannerText] : [COLOR.groupFill, COLOR.groupText];
  cell.font = { bold: true, color: { argb: text } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  cell.border = THIN_BORDER;
}

/** Plain data row — number format picked per cell (one decimal only when the
 * value actually has one, e.g. Synthetic Oil litres) so whole-rupee/count
 * figures don't grow a spurious ".0". */
function styleDataRow(row: Row, totalCols: number, opts: { isPercent: boolean; muted?: boolean }): void {
  const labelCell = row.getCell(1);
  labelCell.font = { italic: !!opts.muted, color: { argb: opts.muted ? COLOR.mutedText : "FF0F172A" } };
  labelCell.border = THIN_BORDER;
  for (let c = 2; c <= totalCols; c++) {
    const cell = row.getCell(c);
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: "right" };
    if (typeof cell.value !== "number") continue;
    cell.numFmt = opts.isPercent ? "0.0%" : Number.isInteger(cell.value) ? "#,##0" : "#,##0.0";
  }
}

/** Achievement-% row — each cell additionally tinted by achievementTone()'s
 * own good/warn/critical thresholds, reused as-is so the colour bands can
 * never drift from what the live dashboard calls "on track". */
function styleAchRow(row: Row, totalCols: number): void {
  const labelCell = row.getCell(1);
  labelCell.font = { italic: true, color: { argb: COLOR.mutedText } };
  labelCell.border = THIN_BORDER;
  for (let c = 2; c <= totalCols; c++) {
    const cell = row.getCell(c);
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: "right" };
    if (typeof cell.value !== "number") continue;
    cell.numFmt = "0.0%";
    cell.font = { bold: true };
    const tone = achievementTone(cell.value);
    const [textColor, fillColor] =
      tone === "good" ? [COLOR.good, COLOR.goodSoft] : tone === "warn" ? [COLOR.warn, COLOR.warnSoft] : tone === "critical" ? [COLOR.bad, COLOR.badSoft] : [null, null];
    if (textColor && fillColor) {
      cell.font = { bold: true, color: { argb: textColor } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
    }
  }
}

function styleBlankManualRow(row: Row, totalCols: number): void {
  for (let c = 1; c <= totalCols; c++) {
    const cell = row.getCell(c);
    cell.border = THIN_BORDER;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.warnBannerFill } };
    if (c === 1) cell.font = { color: { argb: COLOR.warnBannerText } };
  }
}

// ---- row builders -------------------------------------------------------

function pushMetricRows(ws: Worksheet, def: MetricDef, cols: Col[], byBranch: Map<string, BranchReport>, report: Report, totalCols: number): void {
  const isPercentMetric = def.fmt === formatPercent;
  const cells = cols.map((col) => cellFor(col, def, byBranch, report));
  if (cells.some((c) => c.today !== null)) {
    styleDataRow(ws.addRow([`${def.label} — Today`, ...cells.map((c) => c.today ?? "")]), totalCols, { isPercent: isPercentMetric });
  }
  if (cells.some((c) => c.mtd !== null)) {
    styleDataRow(ws.addRow([`${def.label} — MTD`, ...cells.map((c) => c.mtd ?? "")]), totalCols, { isPercent: isPercentMetric });
  }
  if (cells.some((c) => c.target !== null)) {
    styleDataRow(ws.addRow([`${def.label} — Target`, ...cells.map((c) => c.target ?? "")]), totalCols, { isPercent: isPercentMetric, muted: true });
  }
  if (cells.some((c) => c.ratio !== null)) {
    styleAchRow(ws.addRow([`${def.label} — Ach %`, ...cells.map((c) => c.ratio ?? "")]), totalCols);
  }
}

function buildSection(rowDefs: RowDef[], ws: Worksheet, cols: Col[], byBranch: Map<string, BranchReport>, report: Report, totalCols: number): void {
  for (const row of rowDefs) {
    if (row.kind === "group") {
      addGroupRow(ws, row.label, totalCols);
      continue;
    }
    pushMetricRows(ws, row, cols, byBranch, report, totalCols);
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

function buildUntrackedSection(ws: Worksheet, cols: Col[], totalCols: number): void {
  addGroupRow(ws, "Manual Entry — Not Tracked By The Dashboard (fill in by hand)", totalCols, "warn");
  for (const label of UNTRACKED_LABELS) {
    styleBlankManualRow(ws.addRow([`${label} — Today`, ...cols.map(() => "")]), totalCols);
    styleBlankManualRow(ws.addRow([`${label} — MTD`, ...cols.map(() => "")]), totalCols);
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

/** Always emits both the "same date ..." total row and its improvement-%
 * row — even when there's no report at all for that comparison date (e.g.
 * "last year" currently, since real data only goes back to around Aug/Sep
 * 2026 — see vp-data.ts's own INCLUDE_LAST_MONTH_SCOPE comment). A missing
 * report renders blank cells rather than dropping the section, so the
 * layout stays stable and the row is there once a year of history exists. */
function addComparisonBlock(ws: Worksheet, cols: Col[], label: string, thisReport: Report, otherReport: Report | null, otherDate: string, totalCols: number): void {
  const totalDef = findMetric("Total MTD (Rs)");
  const otherByBranch = otherReport ? byBranchMap(otherReport) : null;
  styleDataRow(
    ws.addRow([
      `Same date ${label} (${otherDate}) — Total MTD (Rs)`,
      ...cols.map((col) => (otherReport && otherByBranch ? cellFor(col, totalDef, otherByBranch, otherReport).mtd ?? "" : "")),
    ]),
    totalCols,
    { isPercent: false, muted: true }
  );
  const improvementLabel = `Improvement over ${label} %`;
  const row = otherReport ? improvementRow(cols, improvementLabel, thisReport, otherReport) : [improvementLabel, ...cols.map(() => "")];
  styleDataRow(ws.addRow(row), totalCols, { isPercent: true });
}

function buildComparisonSection(ws: Worksheet, cols: Col[], report: Report, lastMonthReport: Report | null, lastYearReport: Report | null, totalCols: number): void {
  const totalDef = findMetric("Total MTD (Rs)");
  addGroupRow(ws, "Comparison — Total Revenue Stream MTD (Rs)", totalCols);
  const byBranch = byBranchMap(report);
  styleDataRow(
    ws.addRow([`${report.date} — Total MTD (Rs)`, ...cols.map((col) => cellFor(col, totalDef, byBranch, report).mtd ?? "")]),
    totalCols,
    { isPercent: false }
  );

  addComparisonBlock(ws, cols, "last month", report, lastMonthReport, lastMonthReport?.date ?? sameDayLastMonth(report.date), totalCols);
  addComparisonBlock(ws, cols, "last year", report, lastYearReport, lastYearReport?.date ?? sameDayLastYear(report.date), totalCols);
}

function setupSheet(ws: Worksheet, cols: Col[], report: Report, totalCols: number): void {
  ws.columns = Array.from({ length: totalCols }, (_, i) => ({ width: i === 0 ? 42 : 14 }));
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
  addTitleRow(ws, "Nippon Group — Revenue Stream Daily Report", totalCols);
  addSubtitleRow(ws, `As of ${report.date}`, totalCols);
  addHeaderRows(ws, cols, totalCols);
}

export type RevenueStreamWorkbookInput = {
  report: Report;
  lastMonthReport: Report | null;
  lastYearReport: Report | null;
};

export function buildRevenueStreamWorkbook(input: RevenueStreamWorkbookInput): Workbook {
  const { report, lastMonthReport, lastYearReport } = input;
  const cols = buildColumns();
  const byBranch = byBranchMap(report);
  const totalCols = cols.length + 1;

  const workbook = new Workbook();
  workbook.creator = "Nippon Group Aftersales Dashboard";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Daily Summary");
  setupSheet(summary, cols, report, totalCols);
  buildSection(SUMMARY_ROWS, summary, cols, byBranch, report, totalCols);
  buildComparisonSection(summary, cols, report, lastMonthReport, lastYearReport, totalCols);

  const detail = workbook.addWorksheet("Daily Detail");
  setupSheet(detail, cols, report, totalCols);
  buildSection(DAILY_REPORT_ROWS, detail, cols, byBranch, report, totalCols);
  buildUntrackedSection(detail, cols, totalCols);
  buildComparisonSection(detail, cols, report, lastMonthReport, lastYearReport, totalCols);

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
export async function loadRevenueStreamWorkbook(date: string): Promise<{ workbook: Workbook; report: Report } | null> {
  const report = await buildReport(date);
  if (!report) return null;
  const [lastMonthReport, lastYearReport] = await Promise.all([buildReport(sameDayLastMonth(date)), buildReport(sameDayLastYear(date))]);
  const workbook = buildRevenueStreamWorkbook({ report, lastMonthReport, lastYearReport });
  return { workbook, report };
}
