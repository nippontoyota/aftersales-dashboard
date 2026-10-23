import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { reportingDate } from "@/lib/reporting-date";
import { loadReportHolidaySet, listReportHolidays } from "@/lib/report-holidays/store";
import { isDatePublished } from "@/lib/publish-store";
import { buildReport, type Report } from "@/lib/report";

/**
 * Daily Revenue Stream Excel download. Gathers the live numbers here
 * (buildReport(), the same aggregation the dashboard itself uses) and hands
 * them as JSON to the revenue_stream_fill Python function, which fills them
 * into the user's own "Revenue Stream.xlsx" template
 * (templates/revenue-stream-template.xlsx) cell by cell — every formula,
 * style, and merge in that file is left exactly as it was (2026-10-23, at
 * the user's request, replacing the from-scratch ExcelJS version — see
 * api/revenue_stream_fill.py for the full row mapping and reasoning).
 *
 * HQ can download any date, unrestricted, same as every other tool on
 * /data. A branch admin can only ever download today's own report, and only
 * once HQ has published it (2026-10-23, at the user's request) — the `date`
 * query param is ignored entirely for a branch admin rather than trusted,
 * so there's no way to ask for an unpublished or past date by editing the
 * URL.
 */

function shiftMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const totalMonths = y * 12 + (m - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d, daysInTargetMonth);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}
const sameDayLastMonth = (date: string): string => shiftMonths(date, -1);
const sameDayLastYear = (date: string): string => shiftMonths(date, -12);

function monthBounds(date: string): { start: string; end: string } {
  const [y, m] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

function branchMap(report: Report | null): Record<string, Report["branches"][number]> | null {
  if (!report) return null;
  return Object.fromEntries(report.branches.map((b) => [b.branch, b]));
}

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "hq" && admin.role !== "branch" && admin.role !== "vp_service")) {
    return NextResponse.json({ error: "HQ, branch, or VP Service sign-in required." }, { status: 401 });
  }

  const holidaySet = await loadReportHolidaySet();
  const currentDate = reportingDate(holidaySet);

  let date: string;
  if (admin.role === "branch") {
    date = currentDate;
    if (!(await isDatePublished(date))) {
      return NextResponse.json({ error: "Today's report hasn't been published yet." }, { status: 403 });
    }
  } else {
    const { searchParams } = new URL(request.url);
    date = searchParams.get("date") ?? currentDate;
  }

  const [report, lastMonthReport, lastYearReport, allHolidays] = await Promise.all([
    buildReport(date),
    buildReport(sameDayLastMonth(date)),
    buildReport(sameDayLastYear(date)),
    listReportHolidays(),
  ]);
  if (!report) {
    return NextResponse.json({ error: "No report for this date." }, { status: 404 });
  }

  const { start: monthStart, end: monthEnd } = monthBounds(date);
  const holidays = allHolidays
    .map((h) => h.date)
    .filter((d) => d >= monthStart && d <= monthEnd)
    .sort();

  const payload = {
    date,
    lastMonthDate: sameDayLastMonth(date),
    lastYearDate: sameDayLastYear(date),
    monthStart,
    monthEnd,
    holidays,
    branches: branchMap(report),
    branchesLastMonth: branchMap(lastMonthReport),
    branchesLastYear: branchMap(lastYearReport),
  };

  const fillUrl = new URL("/api/revenue_stream_fill", request.url);
  const fillResponse = await fetch(fillUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!fillResponse.ok) {
    const detail = await fillResponse.text();
    return NextResponse.json({ error: "Template fill failed.", detail }, { status: 502 });
  }

  const buffer = await fillResponse.arrayBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="revenue-stream-${date}.xlsx"`,
    },
  });
}
