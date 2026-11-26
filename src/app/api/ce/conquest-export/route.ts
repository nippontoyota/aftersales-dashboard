import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentAdmin } from "@/lib/auth";
import { CE_CONQUEST_BULK_OUTCOME_OPTIONS, CE_FOLLOW_UP_FILTERS, CE_STATUSES, formatCeDate, indiaDate, type CeFollowUpFilter, type CeStatus } from "@/lib/ce/rules";
import { loadConquestLeadPage } from "@/lib/ce/conquest-store";

/** Excel download of the Conquest leads list (2026-11-13, at the user's
 * request) — same "download, call offline, reupload" flow already built
 * for the MRS catch list (see /api/ce/mrs-export's doc comment), the same
 * rows /ce/conquest shows under whatever search/workflow/follow-up/PM-month
 * filters were active when "Download Excel" was clicked. Lead ID (not VIN —
 * not every conquest lead has one) is the reupload's join key. */
const EXPORT_ROW_CAP = 20_000;

const READONLY_HEADERS = ["Lead ID", "Owner", "Contact", "Registration", "VIN", "Model", "Registered", "Workflow"];
const READONLY_WIDTHS = [10, 22, 15, 14, 20, 20, 14, 18];
const FILLABLE_HEADERS = ["Outcome", "Follow-up / Appointment Date (DD/MM/YYYY)", "Note"];
const FILLABLE_WIDTHS = [26, 30, 40];

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "ce_head" && admin.role !== "ce_agent" && admin.role !== "hq")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim().slice(0, 100) || undefined;
  const statuses = searchParams.getAll("status").filter((item): item is CeStatus => CE_STATUSES.includes(item as CeStatus));
  const followUps = searchParams.getAll("followUp").filter((item): item is CeFollowUpFilter => CE_FOLLOW_UP_FILTERS.includes(item as CeFollowUpFilter));
  const pmMonthParam = searchParams.get("pmMonth");
  const pmMonth = pmMonthParam ? Math.min(12, Math.max(0, Number.parseInt(pmMonthParam, 10) || 0)) : 0;
  const pmMonths = pmMonth === 0 ? undefined : [pmMonth];
  // An agent can only ever export their own assigned leads — same scoping
  // as the page itself, not just whatever filters happened to be in the URL.
  const assignedTo = admin.role === "ce_agent" ? admin.username : undefined;
  const today = indiaDate();

  const data = await loadConquestLeadPage({ today, query, statuses, followUps, pmMonths, assignedTo, page: 1, limit: EXPORT_ROW_CAP });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Conquest leads");
  sheet.columns = [...READONLY_WIDTHS, ...FILLABLE_WIDTHS].map((width) => ({ width }));
  sheet.addRow([...READONLY_HEADERS, ...FILLABLE_HEADERS]);
  sheet.getRow(1).font = { bold: true };

  for (const row of data.rows) {
    sheet.addRow([row.id, row.ownerName ?? "", row.ownerMobile ?? "", row.registrationNo, row.vin ?? "", row.vehicleModel ?? "", row.registrationDate ? formatCeDate(row.registrationDate) : "", row.status]);
  }

  const lastRow = data.rows.length + 1;
  const outcomeCol = READONLY_HEADERS.length + 1;
  const dateCol = READONLY_HEADERS.length + 2;

  // Same hidden-sheet dropdown technique as MRS's export — an inline list
  // formula would split on the comma inside "Ringing, no answer".
  const optionsSheet = workbook.addWorksheet("Outcomes");
  optionsSheet.state = "veryHidden";
  CE_CONQUEST_BULK_OUTCOME_OPTIONS.forEach((option, index) => { optionsSheet.getCell(index + 1, 1).value = option; });

  for (let r = 2; r <= lastRow; r++) {
    sheet.getCell(r, outcomeCol).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`Outcomes!$A$1:$A$${CE_CONQUEST_BULK_OUTCOME_OPTIONS.length}`],
      showErrorMessage: true,
      errorStyle: "warning",
      error: "Pick one of the dropdown values — typing something else will be rejected on reupload.",
    };
    sheet.getCell(r, dateCol).numFmt = "@";
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="conquest-leads-${today}.xlsx"`,
    },
  });
}
