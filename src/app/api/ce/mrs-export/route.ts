import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentAdmin } from "@/lib/auth";
import { CE_MRS_BULK_OUTCOME_OPTIONS, CE_STATUSES, formatCeDate, indiaDate, type CeStatus } from "@/lib/ce/rules";
import { loadCeMrsGapList } from "@/lib/ce/store";
import { CE_VEHICLE_BRANDS, type CeVehicleBrand } from "@/lib/ce/vehicle-brand";

/** Excel download of the MRS catch list (2026-11-02, at the user's
 * request) — the same rows /ce/mrs shows, under whatever section/search/
 * dealer/workflow/brand filters were active when "Download Excel" was
 * clicked, so this is never a separate "all of it" dump out of step with
 * what's on screen. Capped well above any real current count (Overdue is
 * ~2,100 today) so one query covers the whole filtered list without a
 * second round trip for the true total. */
const EXPORT_ROW_CAP = 20_000;

const READONLY_HEADERS = ["Customer", "Contact", "VIN", "Model", "Allocated dealer", "Last visit date", "Last visit mileage (km)", "Due date", "Workflow"];
const READONLY_WIDTHS = [24, 15, 20, 20, 16, 14, 20, 12, 18];
// 2026-11-05, at the user's request: the CAC team's own calling system is
// slow enough that clicking into each lead one at a time to log a result
// is a real drag, so the same sheet they already use for reference also
// gets fillable columns — call it, type the outcome here, reupload (see
// /api/ce/mrs-bulk-update/{preview,apply}) instead of working the web UI
// lead by lead. Call status is never asked separately — it's recoverable
// from which outcome list a value belongs to (see resolveCeBulkOutcome).
const FILLABLE_HEADERS = ["Outcome", "Follow-up / Appointment Date (DD/MM/YYYY)", "Note"];
const FILLABLE_WIDTHS = [26, 30, 40];

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "ce_head" && admin.role !== "ce_agent" && admin.role !== "hq")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const section = searchParams.get("section") === "overdue" ? "overdue" : "priority";
  const stageParam = searchParams.get("stage");
  const stage = stageParam === "followup" ? "followup" : stageParam === "closed" ? "closed" : "new";
  const query = searchParams.get("q")?.trim().slice(0, 100) || undefined;
  const dealers = searchParams.getAll("dealer");
  const statuses = searchParams.getAll("status").filter((item): item is CeStatus => CE_STATUSES.includes(item as CeStatus));
  const brandParam = searchParams.get("brand");
  const brand = CE_VEHICLE_BRANDS.includes(brandParam as CeVehicleBrand) ? (brandParam as CeVehicleBrand) : undefined;
  // An agent can only ever export their own assigned leads — same scoping
  // as the page itself, not just whatever filters happened to be in the URL.
  const assignedTo = admin.role === "ce_agent" ? admin.username : undefined;
  const today = indiaDate();

  const data = await loadCeMrsGapList({ today, section, stage, query, dealers, statuses, brand, assignedTo, page: 1, limit: EXPORT_ROW_CAP });

  const workbook = new ExcelJS.Workbook();
  const sheetName = section === "priority" ? "Priority" : "Overdue";
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [...READONLY_WIDTHS, ...FILLABLE_WIDTHS].map((width) => ({ width }));
  sheet.addRow([...READONLY_HEADERS, ...FILLABLE_HEADERS]);
  sheet.getRow(1).font = { bold: true };

  for (const row of data.rows) {
    sheet.addRow([row.customerName, row.contactNumber ?? "", row.vin, row.vehicleModel ?? "", row.allocatedDealer, formatCeDate(row.nReportDate), row.nMileage, formatCeDate(row.dueDate), row.status]);
  }

  const lastRow = data.rows.length + 1;
  const outcomeCol = READONLY_HEADERS.length + 1;
  const dateCol = READONLY_HEADERS.length + 2;

  // Data-validation dropdown needs a cell range, not an inline comma list —
  // several outcome values ("Ringing, no answer") contain a literal comma,
  // which an inline list formula would otherwise split on. A hidden helper
  // sheet sidesteps that entirely.
  const optionsSheet = workbook.addWorksheet("Outcomes");
  optionsSheet.state = "veryHidden";
  CE_MRS_BULK_OUTCOME_OPTIONS.forEach((option, index) => { optionsSheet.getCell(index + 1, 1).value = option; });

  for (let r = 2; r <= lastRow; r++) {
    sheet.getCell(r, outcomeCol).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`Outcomes!$A$1:$A$${CE_MRS_BULK_OUTCOME_OPTIONS.length}`],
      showErrorMessage: true,
      errorStyle: "warning",
      error: "Pick one of the dropdown values — typing something else will be rejected on reupload.",
    };
    // Kept as text so Excel never silently reinterprets a typed DD/MM/YYYY
    // as a locale-dependent date serial — the reupload parser reads this
    // format directly (and a real Excel date still works too, if typed via
    // Excel's own date entry instead).
    sheet.getCell(r, dateCol).numFmt = "@";
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mrs-catch-list-${section}-${stage}-${today}.xlsx"`,
    },
  });
}
