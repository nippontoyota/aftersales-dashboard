import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { reportingDate } from "@/lib/reporting-date";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";
import { loadRevenueStreamWorkbook } from "@/lib/revenue-stream-export";

/**
 * Daily "fill in the gaps" Excel template download (2026-10-23, at the
 * user's request) — HQ admin only, same as every other tool on /data.
 */
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") {
    return NextResponse.json({ error: "HQ admin sign-in required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const holidaySet = await loadReportHolidaySet();
  const date = searchParams.get("date") ?? reportingDate(holidaySet);

  const result = await loadRevenueStreamWorkbook(date);
  if (!result) {
    return NextResponse.json({ error: "No report for this date." }, { status: 404 });
  }

  const buffer = await result.workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="revenue-stream-${date}.xlsx"`,
    },
  });
}
