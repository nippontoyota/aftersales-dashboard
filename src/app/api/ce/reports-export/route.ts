import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentAdmin } from "@/lib/auth";
import { formatCeDate, indiaDate, isValidIsoDate } from "@/lib/ce/rules";
import { loadCeCallPerformance, type CeCallPerformanceDay } from "@/lib/ce/report-store";

function pct(numerator: number, denominator: number): string {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : "—";
}

function addDaysIso(dateIso: string, days: number): string {
  return new Date(Date.parse(`${dateIso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function toRow(day: CeCallPerformanceDay, label: string): (string | number)[] {
  return [label, day.attempted, day.connected, pct(day.connected, day.attempted), day.appointments, pct(day.appointments, day.connected), pct(day.appointments, day.attempted)];
}

/** Excel download of the CE call-performance report (2026-11-12, at the
 * user's request) — same figures /ce/reports shows for whatever date
 * range was active. */
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin || (admin.role !== "ce_head" && admin.role !== "ce_agent" && admin.role !== "hq")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const today = indiaDate();
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const endDate = toRaw && isValidIsoDate(toRaw) && toRaw <= today ? toRaw : today;
  const startDate = fromRaw && isValidIsoDate(fromRaw) && fromRaw <= endDate ? fromRaw : addDaysIso(endDate, -29);

  const data = await loadCeCallPerformance({ startDate, endDate });

  const header = ["Date", "Calls logged", "Connected", "Connected %", "Appointments", "Appt % of connected", "Appt % of all calls"];
  const aoa: (string | number)[][] = [header, toRow(data.totals, "Total")];
  for (const day of data.days) aoa.push(toRow(day, formatCeDate(day.date)));

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 20 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Call performance");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ce-call-performance-${startDate}-to-${endDate}.xlsx"`,
    },
  });
}
