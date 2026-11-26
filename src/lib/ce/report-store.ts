import "server-only";
import { pool } from "@/lib/db";

export type CeCallPerformanceDay = {
  date: string;
  attempted: number;
  connected: number;
  appointments: number;
};

export type CeCallPerformanceReport = {
  days: CeCallPerformanceDay[];
  totals: CeCallPerformanceDay;
};

/** Daily calling-performance report (2026-11-12, at the user's request):
 * how many calls the CE team logged each day, how many connected, and how
 * many of those turned into a booked appointment. Combines ce_lead_activity
 * (the main /ce leads page and the MRS catch list — they share one table)
 * with ce_conquest_activity (Conquest leads), summed per day, so this
 * stays accurate once Conquest calling starts without needing a rebuild.
 * Excludes rows with no attempt_number — the "MRS follow-up already
 * scheduled" shortcut logs an activity row but never actually places a
 * call, so it shouldn't count as one. Grouped by the IST calendar date of
 * created_at, same convention as the rest of CE's day-based logic. */
export async function loadCeCallPerformance(options: { startDate: string; endDate: string }): Promise<CeCallPerformanceReport> {
  const { rows } = await pool.query<{ date: string; attempted: string; connected: string; appointments: string }>(
    `select day::text as date,
       sum(attempted)::int attempted, sum(connected)::int connected, sum(appointments)::int appointments
     from (
       select (created_at at time zone 'Asia/Kolkata')::date as day,
         count(*) attempted,
         count(*) filter (where call_status = 'connected') connected,
         count(*) filter (where outcome = 'Appointment booked') appointments
       from ce_lead_activity
       where attempt_number is not null
       group by day
       union all
       select (created_at at time zone 'Asia/Kolkata')::date as day,
         count(*) attempted,
         count(*) filter (where call_status = 'connected') connected,
         count(*) filter (where outcome = 'Appointment booked') appointments
       from ce_conquest_activity
       where attempt_number is not null
       group by day
     ) combined
     where day between $1::date and $2::date
     group by day
     order by day desc`,
    [options.startDate, options.endDate],
  );

  const days: CeCallPerformanceDay[] = rows.map((row) => ({
    date: row.date.slice(0, 10),
    attempted: Number(row.attempted),
    connected: Number(row.connected),
    appointments: Number(row.appointments),
  }));

  const totals = days.reduce<CeCallPerformanceDay>(
    (sum, day) => ({ date: "", attempted: sum.attempted + day.attempted, connected: sum.connected + day.connected, appointments: sum.appointments + day.appointments }),
    { date: "", attempted: 0, connected: 0, appointments: 0 },
  );

  return { days, totals };
}
