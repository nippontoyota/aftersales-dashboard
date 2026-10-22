import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentAdmin } from "@/lib/auth";
import { loadVpData } from "@/lib/vp-data";
import { buildSlabRows } from "@/app/vp/vp-branch-slab-table";

/**
 * Excel download of the Incentive Slab Targets table (2026-10-22, at the
 * VP's request — he wanted the Target/Achievement figures as plain whole
 * rupees, not the compact "₹26.5 Cr" the on-screen badges show). Same rows
 * and combine rules as the live table (`buildSlabRows`, shared so the two
 * can't drift) — the Group row, then every branch, CO01E folded into
 * "CO01B + CO01E". No % column and no pace colour, per his ask: just the
 * raw Target and Achievement figures.
 */
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "vp_service" && admin.role !== "hq")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedDate = searchParams.get("date") ?? undefined;
  const data = await loadVpData(requestedDate);
  if (!data || !data.report || !data.scopes[0]) {
    return NextResponse.json({ error: "No report for this date." }, { status: 404 });
  }

  const rows = buildSlabRows(data.report.branches, data.scopes[0], data.incentiveSlabTargetsByBranch);

  const whole = (value: number | undefined | null): number | "" => (value === undefined || value === null ? "" : Math.round(value));

  const header = ["Branch", "Achievement (Rs)", "Slab 1 Target (Rs)", "Slab 2 Target (Rs)", "Slab 3 Target (Rs)", "Slab 4 Target (Rs)"];
  const aoa: (string | number)[][] = [header];
  for (const row of rows) {
    aoa.push([row.branch, whole(row.totalRevenueStreamMtd), whole(row.targets?.slab1), whole(row.targets?.slab2), whole(row.targets?.slab3), whole(row.targets?.slab4)]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = header.map((_, i) => ({ wch: i === 0 ? 18 : 17 }));
  const numberFormat = "#,##0";
  for (let r = 1; r < aoa.length; r++) {
    for (let c = 1; c <= 4; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = numberFormat;
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Incentive Slab Targets");
  const buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="incentive-slab-targets-${data.date}.xlsx"`,
    },
  });
}
