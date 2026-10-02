"use server";

import { getCurrentAdmin } from "@/lib/auth";
import { reportingDate } from "@/lib/reporting-date";
import { listReportHolidays, pendingHolidaysToMerge, type PendingHolidayMerge } from "@/lib/report-holidays/store";

export type PendingHolidayMergeResult = { canonicalDate: string; holidays: PendingHolidayMerge[] };

/** Branch-only — see pendingHolidaysToMerge() for the rule. */
export async function getPendingHolidayMergeAction(): Promise<PendingHolidayMergeResult> {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "branch") return { canonicalDate: "", holidays: [] };

  const holidays = await listReportHolidays();
  const holidaySet = new Set(holidays.map((h) => h.date));
  const canonicalDate = reportingDate(holidaySet);
  const today = new Date().toISOString().slice(0, 10);
  return { canonicalDate, holidays: pendingHolidaysToMerge(holidays, canonicalDate, today) };
}
