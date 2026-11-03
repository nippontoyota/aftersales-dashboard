import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentAdmin } from "@/lib/auth";
import { CE_STATUSES, formatCeDate, indiaDate, type CeStatus } from "@/lib/ce/rules";
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

  const header = ["Customer", "Contact", "VIN", "Model", "Allocated dealer", "Last visit date", "Last visit mileage (km)", "Due date", "Workflow"];
  const aoa: (string | number)[][] = [header];
  for (const row of data.rows) {
    aoa.push([row.customerName, row.contactNumber ?? "", row.vin, row.vehicleModel ?? "", row.allocatedDealer, formatCeDate(row.nReportDate), row.nMileage, formatCeDate(row.dueDate), row.status]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [{ wch: 24 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 18 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, section === "priority" ? "Priority" : "Overdue");
  const buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mrs-catch-list-${section}-${stage}-${today}.xlsx"`,
    },
  });
}
