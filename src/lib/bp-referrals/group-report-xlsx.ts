import ExcelJS from "exceljs";
import { REGIONS, type RegionName } from "@/lib/regions";
import { buildPivot, buildSummary, inclusiveDateRange, loadGroupReportRows } from "./group-report";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONEY_FMT = "#,##0.00";
const PCT_FMT = "0.0%";
/** Generous fixed range for every cross-row/cross-sheet formula below, so a
 * formula never has to know the real last row up front — empty rows past
 * the real data just contribute 0/blank to SUM/COUNTIF. Comfortably above
 * any realistic referral volume (mirrors EXPORT_ROW_CAP in mrs-export). */
const MAX_DATA_ROW = 20_000;
/** Row 1 is a merged title banner, row 2 is the header — every sheet's real
 * data starts here. */
const DATA_START_ROW = 3;

function formatDisplayDate(v: string): string {
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}

function asDate(v: Date | string | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 1-indexed column number -> Excel letter ("A", "Z", "AA", ...). */
function colLetter(n: number): string {
  let s = "";
  let i = n;
  while (i > 0) {
    const rem = (i - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

// ---- shared styling ----
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F5496" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14, color: { argb: "FF2F5496" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7ECF5" } };
const BAND_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FC" } };
const THIN_GREY: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFD9D9D9" } };
const CELL_BORDER: Partial<ExcelJS.Borders> = { top: THIN_GREY, left: THIN_GREY, bottom: THIN_GREY, right: THIN_GREY };

function addTitleAndHeader(sheet: ExcelJS.Worksheet, title: string, headers: string[]): void {
  sheet.mergeCells(1, 1, 1, headers.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = TITLE_FONT;
  titleCell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 26;

  const headerRow = sheet.getRow(2);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = CELL_BORDER;
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  headerRow.height = 30;
  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 2 }];
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: headers.length } };
}

function styleDataRow(row: ExcelJS.Row, colCount: number, opts?: { total?: boolean; band?: boolean }): void {
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.border = CELL_BORDER;
    if (opts?.total) {
      cell.fill = TOTAL_FILL;
    } else if (opts?.band) {
      cell.fill = BAND_FILL;
    }
  }
  if (opts?.total) row.font = { bold: true };
}

// ---- raw log column layout (also the lookup table every SUMIF/COUNTIF
// formula on the other sheets is keyed against) ----
const RAW_LOG_KEYS = [
  "sl", "region", "date", "month", "emp", "empId", "dept", "branch", "veh", "model", "ro",
  "estimate", "invoiced", "inc1", "inc2", "dlr", "converted", "partsRev", "partsCost", "labRev", "labCost", "remarks",
] as const;
const RAW_LOG_HEADERS: Record<(typeof RAW_LOG_KEYS)[number], string> = {
  sl: "Sl.No", region: "Region", date: "Date of Info", month: "Month", emp: "Employee name", empId: "Emp ID",
  dept: "Department", branch: "Branch", veh: "Vehicle No", model: "Model", ro: "RO Number", estimate: "Estimate Amt (Rs.)",
  invoiced: "Invoiced Amt (Rs.)", inc1: "Incentive 1", inc2: "Incentive 2", dlr: "Dlr Code", converted: "Converted",
  partsRev: "Parts Revenue", partsCost: "Parts Cost", labRev: "Labour Revenue", labCost: "Labour Cost", remarks: "Remarks",
};
const RAW_LOG_WIDTHS: Record<(typeof RAW_LOG_KEYS)[number], number> = {
  sl: 7, region: 10, date: 13, month: 7, emp: 22, empId: 9, dept: 14, branch: 10, veh: 14, model: 14, ro: 15,
  estimate: 15, invoiced: 15, inc1: 10, inc2: 10, dlr: 10, converted: 11, partsRev: 14, partsCost: 13,
  labRev: 14, labCost: 13, remarks: 30,
};
const RAW_LOG_SHEET = "BP Referral";
/** Letter of a raw-log column, e.g. rawCol("dlr") -> "O" — every formula
 * elsewhere in the workbook that reads the raw log goes through this so the
 * column layout only has to be correct in one place. */
function rawCol(key: (typeof RAW_LOG_KEYS)[number]): string {
  return colLetter(RAW_LOG_KEYS.indexOf(key) + 1);
}
function rawRange(key: (typeof RAW_LOG_KEYS)[number]): string {
  const c = rawCol(key);
  return `'${RAW_LOG_SHEET}'!$${c}$${DATA_START_ROW}:$${c}$${MAX_DATA_ROW}`;
}

export type GroupReportParams = { from: string; to: string; branches?: string[] };

/**
 * Builds the multi-sheet "Group Accident Vehicle Referral" workbook (2026-
 * 11-09, at BP HO's request; reworked the same day to use live formulas +
 * real styling instead of pre-computed values — the user's follow-up ask).
 * The raw log ("BP Referral") is the only sheet with real values; Pivot,
 * Summary, and ROI are SUMIF/COUNTIF/cross-sheet formulas over it, so
 * editing or re-deriving a row in Excel recalculates everything downstream
 * — same spirit as the hand-maintained sheet BP HO shared, but now
 * auditable instead of trusting whatever was last typed in. Every formula
 * cell also carries a cached `result` (computed the same way in JS) so the
 * file shows correct numbers immediately on open, before any recalculation.
 *
 * "Dept.Contribution" is still left out — nothing in this app captures the
 * referring employee's own department yet (the user is handling that
 * capture separately). "Converted" = ro_matched_at set (see group-report.ts).
 * Pulled out of the API route so it can be exercised directly (no auth/HTTP
 * context needed) and shared with any other caller.
 */
export async function buildGroupReportWorkbook({ from, to, branches }: GroupReportParams): Promise<ExcelJS.Workbook> {
  const rows = await loadGroupReportRows(inclusiveDateRange(from, to), branches);
  const pivot = buildPivot(rows);
  const summary = buildSummary(rows);
  const titleRange = `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Aftersales Intelligence Dashboard";
  workbook.created = new Date();

  // ================= Sheet 1: BP Referral (raw log — real values) =================
  const log = workbook.addWorksheet(RAW_LOG_SHEET);
  log.columns = RAW_LOG_KEYS.map((k) => ({ key: k, width: RAW_LOG_WIDTHS[k] }));
  addTitleAndHeader(log, `Group Accident Vehicle Referral — Raw Log  (${titleRange})`, RAW_LOG_KEYS.map((k) => RAW_LOG_HEADERS[k]));

  type RawLogValues = Partial<Record<(typeof RAW_LOG_KEYS)[number], ExcelJS.CellValue>>;
  rows.forEach((r, i) => {
    const d = asDate(r.submittedAt);
    const row = log.getRow(DATA_START_ROW + i);
    const values: RawLogValues = {
      sl: i + 1,
      region: r.region ?? "",
      date: d,
      month: d ? MONTH_SHORT[d.getUTCMonth()] : "",
      emp: r.employeeName ?? "",
      empId: r.employeeId ?? "",
      dept: r.employeeDept ?? "",
      branch: r.employeeBranch ?? "",
      veh: r.vehicleRegNo ?? "",
      model: r.vehicleModel ?? "",
      ro: r.roNo ?? "",
      estimate: r.estimateAmount ?? null,
      invoiced: r.invoicedAmount ?? null,
      inc1: r.incentive1 || null,
      inc2: r.incentive2 || null,
      dlr: r.assignedBranch ?? "",
      converted: r.converted,
      partsRev: r.partsRevenue ?? null,
      partsCost: r.partsCost ?? null,
      labRev: r.labourRevenue ?? null,
      labCost: r.labourCost ?? null,
      remarks: r.remarks ?? "",
    };
    row.values = values as Record<string, ExcelJS.CellValue>;
    row.getCell(RAW_LOG_KEYS.indexOf("date") + 1).numFmt = "dd/mm/yyyy";
    for (const k of ["estimate", "invoiced", "partsRev", "partsCost", "labRev", "labCost"] as const) {
      row.getCell(RAW_LOG_KEYS.indexOf(k) + 1).numFmt = MONEY_FMT;
    }
    styleDataRow(row, RAW_LOG_KEYS.length, { band: i % 2 === 1 });
  });

  // ================= Sheet 2: Pivot (formulas over the raw log) =================
  const pivotSheet = workbook.addWorksheet("Pivot");
  const pivotHeaders = ["Branch", "Count", "Invoiced Amt (Rs.)", "Incentive 1 — Count", "Incentive 1 — Amt", "Incentive 2 — Count", "Incentive 2 — Amt"];
  pivotSheet.columns = [10, 9, 17, 16, 16, 16, 16].map((width) => ({ width }));
  addTitleAndHeader(pivotSheet, `Branch Pivot  (${titleRange})`, pivotHeaders);

  const dlrR = rawRange("dlr");
  const invR = rawRange("invoiced");
  const inc1R = rawRange("inc1");
  const inc2R = rawRange("inc2");
  pivot.forEach((p, i) => {
    const r = DATA_START_ROW + i;
    const row = pivotSheet.getRow(r);
    row.getCell(1).value = p.branch;
    row.getCell(2).value = { formula: `COUNTIF(${dlrR},A${r})`, result: p.count };
    row.getCell(3).value = { formula: `SUMIF(${dlrR},A${r},${invR})`, result: p.invoicedAmount };
    row.getCell(4).value = { formula: `COUNTIFS(${dlrR},A${r},${inc1R},">0")`, result: p.incentive1Count };
    row.getCell(5).value = { formula: `SUMIFS(${inc1R},${dlrR},A${r})`, result: p.incentive1Amount };
    row.getCell(6).value = { formula: `COUNTIFS(${dlrR},A${r},${inc2R},">0")`, result: p.incentive2Count };
    row.getCell(7).value = { formula: `SUMIFS(${inc2R},${dlrR},A${r})`, result: p.incentive2Amount };
    for (const c of [3, 5, 7]) row.getCell(c).numFmt = MONEY_FMT;
    styleDataRow(row, pivotHeaders.length, { band: i % 2 === 1 });
  });
  if (pivot.length > 0) {
    const firstRow = DATA_START_ROW;
    const lastRow = DATA_START_ROW + pivot.length - 1;
    const totalRowNum = lastRow + 1;
    const totalRow = pivotSheet.getRow(totalRowNum);
    totalRow.getCell(1).value = "Total";
    const totals = pivot.reduce(
      (acc, p) => ({
        count: acc.count + p.count, invoicedAmount: acc.invoicedAmount + p.invoicedAmount,
        incentive1Count: acc.incentive1Count + p.incentive1Count, incentive1Amount: acc.incentive1Amount + p.incentive1Amount,
        incentive2Count: acc.incentive2Count + p.incentive2Count, incentive2Amount: acc.incentive2Amount + p.incentive2Amount,
      }),
      { count: 0, invoicedAmount: 0, incentive1Count: 0, incentive1Amount: 0, incentive2Count: 0, incentive2Amount: 0 },
    );
    totalRow.getCell(2).value = { formula: `SUM(B${firstRow}:B${lastRow})`, result: totals.count };
    totalRow.getCell(3).value = { formula: `SUM(C${firstRow}:C${lastRow})`, result: totals.invoicedAmount };
    totalRow.getCell(4).value = { formula: `SUM(D${firstRow}:D${lastRow})`, result: totals.incentive1Count };
    totalRow.getCell(5).value = { formula: `SUM(E${firstRow}:E${lastRow})`, result: totals.incentive1Amount };
    totalRow.getCell(6).value = { formula: `SUM(F${firstRow}:F${lastRow})`, result: totals.incentive2Count };
    totalRow.getCell(7).value = { formula: `SUM(G${firstRow}:G${lastRow})`, result: totals.incentive2Amount };
    for (const c of [3, 5, 7]) totalRow.getCell(c).numFmt = MONEY_FMT;
    styleDataRow(totalRow, pivotHeaders.length, { total: true });
  }

  // ================= Sheet 3: Summary (formulas over the raw log) =================
  const summarySheet = workbook.addWorksheet("Summary");
  const summaryHeaders = [
    "Region", "Dealer Code", "Referral No.s", "No.s Converted", "Count of ₹50 given", "Amount for ₹50 given",
    "Count of ₹200 given", "Amount for ₹200 given", "Revenue from Conversion", "Parts Revenue", "Parts Cost",
    "Parts Margin", "Labour Revenue", "Labour Cost", "Labour Margin", "Total Margin",
  ];
  summarySheet.columns = [10, 20, 12, 13, 13, 14, 13, 14, 16, 14, 13, 13, 14, 13, 13, 13].map((width) => ({ width }));
  addTitleAndHeader(summarySheet, `Summary — Region / Branch  (${titleRange})`, summaryHeaders);

  const convertedR = rawRange("converted");
  const partsRevR = rawRange("partsRev");
  const partsCostR = rawRange("partsCost");
  const labRevR = rawRange("labRev");
  const labCostR = rawRange("labCost");
  const MONEY_COLS = [6, 8, 9, 10, 11, 12, 13, 14, 15, 16];

  let r = DATA_START_ROW;
  const regionTotalRow = new Map<RegionName, number>();
  for (const region of Object.keys(REGIONS) as RegionName[]) {
    const branchRows = summary.byRegion.get(region);
    if (!branchRows || branchRows.length === 0) continue;
    const regionFirstRow = r;
    branchRows.forEach((b, i) => {
      const row = summarySheet.getRow(r);
      row.getCell(1).value = i === 0 ? region : "";
      row.getCell(2).value = b.branch;
      row.getCell(3).value = { formula: `COUNTIF(${dlrR},B${r})`, result: b.referralCount };
      row.getCell(4).value = { formula: `COUNTIFS(${dlrR},B${r},${convertedR},TRUE)`, result: b.convertedCount };
      row.getCell(5).value = { formula: `COUNTIFS(${dlrR},B${r},${inc1R},">0")`, result: b.incentive1Count };
      row.getCell(6).value = { formula: `SUMIFS(${inc1R},${dlrR},B${r})`, result: b.incentive1Amount };
      row.getCell(7).value = { formula: `COUNTIFS(${dlrR},B${r},${inc2R},">0")`, result: b.incentive2Count };
      row.getCell(8).value = { formula: `SUMIFS(${inc2R},${dlrR},B${r})`, result: b.incentive2Amount };
      row.getCell(9).value = { formula: `SUMIFS(${invR},${dlrR},B${r})`, result: b.revenue };
      row.getCell(10).value = { formula: `SUMIFS(${partsRevR},${dlrR},B${r})`, result: b.partsRevenue };
      const partsCost = b.partsRevenue - b.partsMargin;
      row.getCell(11).value = { formula: `SUMIFS(${partsCostR},${dlrR},B${r})`, result: partsCost };
      row.getCell(12).value = { formula: `J${r}-K${r}`, result: b.partsMargin };
      row.getCell(13).value = { formula: `SUMIFS(${labRevR},${dlrR},B${r})`, result: b.labourRevenue };
      const labCost = b.labourRevenue - b.labourMargin;
      row.getCell(14).value = { formula: `SUMIFS(${labCostR},${dlrR},B${r})`, result: labCost };
      row.getCell(15).value = { formula: `M${r}-N${r}`, result: b.labourMargin };
      row.getCell(16).value = { formula: `L${r}+O${r}`, result: b.totalMargin };
      for (const c of MONEY_COLS) row.getCell(c).numFmt = MONEY_FMT;
      styleDataRow(row, summaryHeaders.length, { band: i % 2 === 1 });
      r++;
    });
    const regionLastRow = r - 1;
    const totalRow = summarySheet.getRow(r);
    totalRow.getCell(1).value = "";
    totalRow.getCell(2).value = `${region} Total`;
    const t = summary.regionTotals.get(region)!;
    const tPartsCost = t.partsRevenue - t.partsMargin;
    const tLabCost = t.labourRevenue - t.labourMargin;
    const cachedByCol: Record<number, number> = {
      3: t.referralCount, 4: t.convertedCount, 5: t.incentive1Count, 6: t.incentive1Amount, 7: t.incentive2Count,
      8: t.incentive2Amount, 9: t.revenue, 10: t.partsRevenue, 11: tPartsCost, 12: t.partsMargin, 13: t.labourRevenue,
      14: tLabCost, 15: t.labourMargin, 16: t.totalMargin,
    };
    for (let c = 3; c <= 16; c++) {
      const letter = colLetter(c);
      totalRow.getCell(c).value = { formula: `SUM(${letter}${regionFirstRow}:${letter}${regionLastRow})`, result: cachedByCol[c] };
      if (MONEY_COLS.includes(c)) totalRow.getCell(c).numFmt = MONEY_FMT;
    }
    styleDataRow(totalRow, summaryHeaders.length, { total: true });
    regionTotalRow.set(region, r);
    r++;
  }
  const groupRowNum = r;
  const groupRow = summarySheet.getRow(groupRowNum);
  groupRow.getCell(1).value = "Group";
  groupRow.getCell(2).value = "Total";
  const regionTotalRows = [...regionTotalRow.values()];
  const gPartsCost = summary.grandTotal.partsRevenue - summary.grandTotal.partsMargin;
  const gLabCost = summary.grandTotal.labourRevenue - summary.grandTotal.labourMargin;
  const groupCached: Record<number, number> = {
    3: summary.grandTotal.referralCount, 4: summary.grandTotal.convertedCount, 5: summary.grandTotal.incentive1Count,
    6: summary.grandTotal.incentive1Amount, 7: summary.grandTotal.incentive2Count, 8: summary.grandTotal.incentive2Amount,
    9: summary.grandTotal.revenue, 10: summary.grandTotal.partsRevenue, 11: gPartsCost, 12: summary.grandTotal.partsMargin,
    13: summary.grandTotal.labourRevenue, 14: gLabCost, 15: summary.grandTotal.labourMargin, 16: summary.grandTotal.totalMargin,
  };
  for (let c = 3; c <= 16; c++) {
    const letter = colLetter(c);
    const formula = regionTotalRows.map((rt) => `${letter}${rt}`).join("+");
    groupRow.getCell(c).value = { formula: formula || "0", result: groupCached[c] };
    if (MONEY_COLS.includes(c)) groupRow.getCell(c).numFmt = MONEY_FMT;
  }
  styleDataRow(groupRow, summaryHeaders.length, { total: true });

  // ================= Sheet 4: ROI (cross-sheet formulas off Summary) =================
  const roiSheet = workbook.addWorksheet("ROI");
  const roiHeaders = [
    "Region", "Total referral", "Total no.s converted", "Conversion %", "Parts revenue", "Labour revenue",
    "Parts Margin", "Labour Margin", "Incentive given against referral", "ROI",
  ];
  roiSheet.columns = [12, 13, 17, 12, 15, 15, 14, 14, 20, 15].map((width) => ({ width }));
  addTitleAndHeader(roiSheet, `ROI — Region / Group  (${titleRange})`, roiHeaders);

  const regionsWithData = (Object.keys(REGIONS) as RegionName[]).filter((region) => regionTotalRow.has(region));
  let roiRow = DATA_START_ROW;
  for (const region of regionsWithData) {
    const sRow = regionTotalRow.get(region)!;
    const row = roiSheet.getRow(roiRow);
    const t = summary.regionTotals.get(region)!;
    const incentiveGiven = t.incentive1Amount + t.incentive2Amount;
    row.getCell(1).value = region;
    row.getCell(2).value = { formula: `Summary!C${sRow}`, result: t.referralCount };
    row.getCell(3).value = { formula: `Summary!D${sRow}`, result: t.convertedCount };
    row.getCell(4).value = { formula: `IFERROR(C${roiRow}/B${roiRow},0)`, result: t.referralCount > 0 ? t.convertedCount / t.referralCount : 0 };
    row.getCell(5).value = { formula: `Summary!J${sRow}`, result: t.partsRevenue };
    row.getCell(6).value = { formula: `Summary!M${sRow}`, result: t.labourRevenue };
    row.getCell(7).value = { formula: `Summary!L${sRow}`, result: t.partsMargin };
    row.getCell(8).value = { formula: `Summary!O${sRow}`, result: t.labourMargin };
    row.getCell(9).value = { formula: `Summary!F${sRow}+Summary!H${sRow}`, result: incentiveGiven };
    row.getCell(10).value = { formula: `G${roiRow}+H${roiRow}-I${roiRow}`, result: t.partsMargin + t.labourMargin - incentiveGiven };
    row.getCell(4).numFmt = PCT_FMT;
    for (const c of [5, 6, 7, 8, 9, 10]) row.getCell(c).numFmt = MONEY_FMT;
    styleDataRow(row, roiHeaders.length, { band: false });
    roiRow++;
  }
  const groupRoiRow = roiSheet.getRow(roiRow);
  groupRoiRow.getCell(1).value = "Group";
  groupRoiRow.getCell(2).value = { formula: `Summary!C${groupRowNum}`, result: summary.grandTotal.referralCount };
  groupRoiRow.getCell(3).value = { formula: `Summary!D${groupRowNum}`, result: summary.grandTotal.convertedCount };
  groupRoiRow.getCell(4).value = {
    formula: `IFERROR(C${roiRow}/B${roiRow},0)`,
    result: summary.grandTotal.referralCount > 0 ? summary.grandTotal.convertedCount / summary.grandTotal.referralCount : 0,
  };
  groupRoiRow.getCell(5).value = { formula: `Summary!J${groupRowNum}`, result: summary.grandTotal.partsRevenue };
  groupRoiRow.getCell(6).value = { formula: `Summary!M${groupRowNum}`, result: summary.grandTotal.labourRevenue };
  groupRoiRow.getCell(7).value = { formula: `Summary!L${groupRowNum}`, result: summary.grandTotal.partsMargin };
  groupRoiRow.getCell(8).value = { formula: `Summary!O${groupRowNum}`, result: summary.grandTotal.labourMargin };
  const groupIncentiveGiven = summary.grandTotal.incentive1Amount + summary.grandTotal.incentive2Amount;
  groupRoiRow.getCell(9).value = { formula: `Summary!F${groupRowNum}+Summary!H${groupRowNum}`, result: groupIncentiveGiven };
  groupRoiRow.getCell(10).value = {
    formula: `G${roiRow}+H${roiRow}-I${roiRow}`,
    result: summary.grandTotal.partsMargin + summary.grandTotal.labourMargin - groupIncentiveGiven,
  };
  groupRoiRow.getCell(4).numFmt = PCT_FMT;
  for (const c of [5, 6, 7, 8, 9, 10]) groupRoiRow.getCell(c).numFmt = MONEY_FMT;
  styleDataRow(groupRoiRow, roiHeaders.length, { total: true });

  return workbook;
}
