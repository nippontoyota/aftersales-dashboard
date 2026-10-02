import { pool } from "../db";

/**
 * report_holidays — HQ-flagged non-working dates (see db/schema.sql and
 * src/lib/reporting-date.ts). Edited at /data alongside Accessories Staff.
 */

export type ReportHoliday = { date: string; note: string | null; createdBy: string; createdAt: string };

export async function listReportHolidays(): Promise<ReportHoliday[]> {
  const { rows } = await pool.query<{ date: string; note: string | null; created_by: string; created_at: string }>(
    "select date::text as date, note, created_by, created_at from report_holidays order by date desc",
  );
  return rows.map((r) => ({ date: r.date, note: r.note, createdBy: r.created_by, createdAt: r.created_at }));
}

/** Just the dates, as a Set — what reportingDate() needs. */
export async function loadReportHolidaySet(): Promise<Set<string>> {
  const { rows } = await pool.query<{ date: string }>("select date::text as date from report_holidays");
  return new Set(rows.map((r) => r.date));
}

export async function addReportHoliday(date: string, note: string, createdBy: string): Promise<void> {
  await pool.query(
    "insert into report_holidays (date, note, created_by) values ($1, $2, $3) on conflict (date) do update set note = excluded.note",
    [date, note || null, createdBy],
  );
}

export async function removeReportHoliday(date: string): Promise<void> {
  await pool.query("delete from report_holidays where date = $1", [date]);
}

export type PendingHolidayMerge = { date: string; note: string | null };

/**
 * Holidays a branch should fold into their *next* upload rather than file
 * separately — any flagged date strictly after the canonical report date
 * (so already skipped by reportingDate()) up through today. Drives the
 * HolidayMergePopupGate reminder; empty once the canonical date catches up
 * past the holiday, no manual cleanup needed.
 */
export function pendingHolidaysToMerge(holidays: ReportHoliday[], canonicalDate: string, today: string): PendingHolidayMerge[] {
  return holidays
    .filter((h) => h.date > canonicalDate && h.date <= today)
    .map((h) => ({ date: h.date, note: h.note }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
