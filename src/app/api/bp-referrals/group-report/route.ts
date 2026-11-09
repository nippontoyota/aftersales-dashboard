import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentAdmin } from "@/lib/auth";
import { REGIONS, type RegionName } from "@/lib/regions";
import { branchName } from "@/lib/branch-names";
import { buildPivot, buildRoi, buildSummary, loadGroupReportRows } from "@/lib/bp-referrals/group-report";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONEY_FMT = "#,##0.00";
const PCT_FMT = "0.0%";

function todayIST(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function parseDateParam(v: string | null): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function asDate(v: Date | string | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Multi-sheet Excel "Group Accident Vehicle Referral" report (2026-11-09,
 * at BP HO's request) — reproduces the shape of the Excel they'd been
 * maintaining by hand off real BP Referrals + DMS data instead: a raw log,
 * a branch pivot, a region/branch Summary (with real Parts/Labour Revenue
 * and Margin off the matched RO's own Cost & Sales - BP export row), and a
 * region + Group ROI roll-up. "Dept.Contribution" is deliberately left out
 * — nothing in this app captures the referring employee's own department
 * yet (the user is handling that capture separately). Same role gate and
 * regional branch-scoping as the payout CSV export.
 */
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "bp_ho" && admin.role !== "hq" && admin.role !== "regional")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const today = todayIST();
  const from = parseDateParam(searchParams.get("from")) ?? `${today.slice(0, 4)}-01-01`;
  const to = parseDateParam(searchParams.get("to")) ?? today;
  const range = { start: from, end: addOneDay(to) };
  const branches = admin.role === "regional" ? [...REGIONS[admin.region]] : undefined;

  const rows = await loadGroupReportRows(range, branches);
  const pivot = buildPivot(rows);
  const summary = buildSummary(rows);
  const roi = buildRoi(summary);

  const workbook = new ExcelJS.Workbook();

  // ---- Sheet 1: raw log ----
  const log = workbook.addWorksheet("BP Referral");
  log.columns = [
    { header: "Sl.No", key: "sl", width: 8 },
    { header: "Region", key: "region", width: 10 },
    { header: "Date of Info", key: "date", width: 14 },
    { header: "Month", key: "month", width: 8 },
    { header: "Employee name", key: "emp", width: 22 },
    { header: "Emp ID", key: "empId", width: 10 },
    { header: "Branch", key: "branch", width: 10 },
    { header: "Vehicle No", key: "veh", width: 14 },
    { header: "Model", key: "model", width: 14 },
    { header: "RO Number", key: "ro", width: 16 },
    { header: "Estimate Amt (Rs.)", key: "estimate", width: 16 },
    { header: "Invoiced Amt (Rs.)", key: "invoiced", width: 16 },
    { header: "Incentive 1", key: "inc1", width: 10 },
    { header: "Incentive 2", key: "inc2", width: 10 },
    { header: "Vehicle reported Dlr Code", key: "dlr", width: 20 },
    { header: "Remarks", key: "remarks", width: 30 },
  ];
  log.getRow(1).font = { bold: true };
  rows.forEach((r, i) => {
    const d = asDate(r.submittedAt);
    const row = log.addRow({
      sl: i + 1,
      region: r.region ?? "",
      date: d,
      month: d ? MONTH_SHORT[d.getUTCMonth()] : "",
      emp: r.employeeName ?? "",
      empId: r.employeeId ?? "",
      branch: r.employeeBranch ?? "",
      veh: r.vehicleRegNo ?? "",
      model: r.vehicleModel ?? "",
      ro: r.roNo ?? "",
      estimate: r.estimateAmount ?? null,
      invoiced: r.invoicedAmount ?? null,
      inc1: r.incentive1 || null,
      inc2: r.incentive2 || null,
      dlr: r.assignedBranch ? `${branchName(r.assignedBranch)} (${r.assignedBranch})` : "",
      remarks: r.remarks ?? "",
    });
    row.getCell("date").numFmt = "dd/mm/yyyy";
    row.getCell("estimate").numFmt = MONEY_FMT;
    row.getCell("invoiced").numFmt = MONEY_FMT;
  });

  // ---- Sheet 2: Pivot ----
  const pivotSheet = workbook.addWorksheet("Pivot");
  pivotSheet.columns = [
    { header: "Branch", key: "branch", width: 10 },
    { header: "Count", key: "count", width: 10 },
    { header: "Invoiced Amt (Rs.)", key: "invoiced", width: 18 },
    { header: "Incentive 1 — Count", key: "inc1c", width: 16 },
    { header: "Incentive 1 — Amt", key: "inc1a", width: 16 },
    { header: "Incentive 2 — Count", key: "inc2c", width: 16 },
    { header: "Incentive 2 — Amt", key: "inc2a", width: 16 },
  ];
  pivotSheet.getRow(1).font = { bold: true };
  for (const p of pivot) {
    const row = pivotSheet.addRow({
      branch: `${branchName(p.branch)} (${p.branch})`,
      count: p.count,
      invoiced: p.invoicedAmount,
      inc1c: p.incentive1Count,
      inc1a: p.incentive1Amount,
      inc2c: p.incentive2Count,
      inc2a: p.incentive2Amount,
    });
    row.getCell("invoiced").numFmt = MONEY_FMT;
    row.getCell("inc1a").numFmt = MONEY_FMT;
    row.getCell("inc2a").numFmt = MONEY_FMT;
  }

  // ---- Sheet 3: Summary ----
  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Region", key: "region", width: 10 },
    { header: "Dealer Code", key: "branch", width: 20 },
    { header: "Referral No.s", key: "count", width: 12 },
    { header: "No.s Converted", key: "converted", width: 14 },
    { header: "Count of ₹50 given", key: "inc1c", width: 14 },
    { header: "Amount for ₹50 given", key: "inc1a", width: 16 },
    { header: "Count of ₹200 given", key: "inc2c", width: 14 },
    { header: "Amount for ₹200 given", key: "inc2a", width: 16 },
    { header: "Revenue from Conversion", key: "revenue", width: 18 },
    { header: "Parts Revenue", key: "partsRev", width: 16 },
    { header: "Parts Margin", key: "partsMgn", width: 16 },
    { header: "Labour Revenue", key: "labRev", width: 16 },
    { header: "Labour Margin", key: "labMgn", width: 16 },
    { header: "Total Margin", key: "totMgn", width: 16 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  const moneyKeys = ["inc1a", "inc2a", "revenue", "partsRev", "partsMgn", "labRev", "labMgn", "totMgn"] as const;
  const addSummaryRow = (region: string, branch: string | null, s: { referralCount: number; convertedCount: number; incentive1Count: number; incentive1Amount: number; incentive2Count: number; incentive2Amount: number; revenue: number; partsRevenue: number; partsMargin: number; labourRevenue: number; labourMargin: number; totalMargin: number }, bold: boolean) => {
    const row = summarySheet.addRow({
      region,
      branch: branch ? `${branchName(branch)} (${branch})` : "Total",
      count: s.referralCount,
      converted: s.convertedCount,
      inc1c: s.incentive1Count,
      inc1a: s.incentive1Amount,
      inc2c: s.incentive2Count,
      inc2a: s.incentive2Amount,
      revenue: s.revenue,
      partsRev: s.partsRevenue,
      partsMgn: s.partsMargin,
      labRev: s.labourRevenue,
      labMgn: s.labourMargin,
      totMgn: s.totalMargin,
    });
    for (const k of moneyKeys) row.getCell(k).numFmt = MONEY_FMT;
    if (bold) row.font = { bold: true };
  };
  for (const region of Object.keys(REGIONS) as RegionName[]) {
    const branchRows = summary.byRegion.get(region);
    if (!branchRows || branchRows.length === 0) continue;
    branchRows.forEach((b, i) => addSummaryRow(i === 0 ? region : "", b.branch, b, false));
    const total = summary.regionTotals.get(region)!;
    addSummaryRow("", null, total, true);
  }
  addSummaryRow("Group", null, summary.grandTotal, true);

  // ---- Sheet 4: ROI ----
  const roiSheet = workbook.addWorksheet("ROI");
  roiSheet.columns = [
    { header: "Region", key: "region", width: 12 },
    { header: "Total referral", key: "count", width: 14 },
    { header: "Total no.s converted", key: "converted", width: 16 },
    { header: "Conversion %", key: "pct", width: 12 },
    { header: "Parts revenue", key: "partsRev", width: 16 },
    { header: "Labour revenue", key: "labRev", width: 16 },
    { header: "Parts Margin", key: "partsMgn", width: 16 },
    { header: "Labour Margin", key: "labMgn", width: 16 },
    { header: "Incentive given against referral", key: "incentive", width: 20 },
    { header: "ROI", key: "roi", width: 16 },
  ];
  roiSheet.getRow(1).font = { bold: true };
  for (const r of roi) {
    const row = roiSheet.addRow({
      region: r.region,
      count: r.totalReferral,
      converted: r.totalConverted,
      pct: r.conversionPct,
      partsRev: r.partsRevenue,
      labRev: r.labourRevenue,
      partsMgn: r.partsMargin,
      labMgn: r.labourMargin,
      incentive: r.incentiveGiven,
      roi: r.roi,
    });
    row.getCell("pct").numFmt = PCT_FMT;
    for (const k of ["partsRev", "labRev", "partsMgn", "labMgn", "incentive", "roi"] as const) row.getCell(k).numFmt = MONEY_FMT;
    if (r.region === "Group") row.font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bp-referral-group-report-${from}-to-${to}.xlsx"`,
    },
  });
}
