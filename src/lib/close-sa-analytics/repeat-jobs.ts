import { pool } from "../db";
import { isGenericCatchAllJobCode, normalizeCloseSaName, REPEAT_JOB_WINDOW_DAYS } from "./compute";

/**
 * Same Car Same Work Repeat — a vehicle getting the exact same Job Code done
 * twice within REPEAT_JOB_WINDOW_DAYS (30 days, confirmed with the user
 * 2026-10-23). Attributed to the SA who closed the REPEAT (later) RO — the
 * comeback is on their watch, not necessarily the original SA's fault.
 *
 * Deliberately NOT part of close_sa_analytics_daily's per-day recompute —
 * every other metric in that table is additive (sum each day's own count),
 * but a repeat is a cross-date comparison that can't be determined from a
 * single day's rows in isolation. Computed live, scoped to one branch/
 * period at a time, straight off raw_upload_rows — cheap enough for that
 * scope (same reasoning as cross-month-replacement.ts's own live queries).
 *
 * Catch-all Job Codes (anything ending "99" — "OTHERS - BRAKE SHOE-DRUM",
 * "ACCINS99" Accessories Installation, etc., confirmed 2026-10-23 against
 * real CO01A data) are excluded: they bundle many different real jobs under
 * one code, so two "OTHERS -" lines on the same car aren't evidence of the
 * same actual work repeating.
 */
export type RepeatJobFlag = {
  branch: string;
  vin: string;
  jobCode: string;
  jobDesc: string;
  firstRo: string;
  firstDate: string;
  firstCloseSa: string;
  secondRo: string;
  secondDate: string;
  secondCloseSa: string;
  daysBetween: number;
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Every repeat whose SECOND (repeat) occurrence falls within [fromDate,
 * toDate] — the lookback window starts REPEAT_JOB_WINDOW_DAYS earlier so a
 * repeat whose first visit was just before the period is still caught. */
export async function findRepeatJobs(branch: string, fromDate: string, toDate: string): Promise<RepeatJobFlag[]> {
  const lookbackStart = addDays(fromDate, -REPEAT_JOB_WINDOW_DAYS);
  const { rows } = await pool.query<{ vin: string; job_code: string; job_desc: string; ro: string; date: string; close_sa: string }>(
    `select row_data->>'Vin no' as vin, row_data->>'Job Code' as job_code, row_data->>'Job Desc' as job_desc,
            row_data->>'Job Order No' as ro, date::text as date, row_data->>'Close Service Advisor Name' as close_sa
       from raw_upload_rows
       where report_type = 'service_info' and branch = $1 and date >= $2 and date <= $3
         and coalesce(row_data->>'Vin no', '') <> '' and coalesce(row_data->>'Job Code', '') <> ''
         and coalesce(row_data->>'Job Order No', '') <> ''`,
    [branch, lookbackStart, toDate]
  );

  const byVinJob = new Map<string, { ro: string; date: string; closeSa: string; jobDesc: string }[]>();
  for (const r of rows) {
    if (isGenericCatchAllJobCode(r.job_code)) continue;
    const key = r.vin + "|" + r.job_code;
    const list = byVinJob.get(key) ?? [];
    if (!list.some((v) => v.ro === r.ro)) list.push({ ro: r.ro, date: r.date, closeSa: normalizeCloseSaName(r.close_sa), jobDesc: r.job_desc });
    byVinJob.set(key, list);
  }

  const flags: RepeatJobFlag[] = [];
  for (const [key, visits] of byVinJob) {
    if (visits.length < 2) continue;
    visits.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < visits.length; i++) {
      const prev = visits[i - 1];
      const cur = visits[i];
      const gap = daysBetween(prev.date, cur.date);
      if (gap > REPEAT_JOB_WINDOW_DAYS || gap <= 0) continue;
      if (cur.date < fromDate || cur.date > toDate) continue; // only the repeat landing in the requested period
      const [vin, jobCode] = key.split("|");
      flags.push({
        branch,
        vin,
        jobCode,
        jobDesc: cur.jobDesc,
        firstRo: prev.ro,
        firstDate: prev.date,
        firstCloseSa: prev.closeSa,
        secondRo: cur.ro,
        secondDate: cur.date,
        secondCloseSa: cur.closeSa,
        daysBetween: gap,
      });
    }
  }
  return flags;
}

/** Attributed to the SA who closed the repeat (2nd) RO. Keyed by
 * `${branch}|${closeSaName}`, not name alone — flags from multiple branches
 * are routinely flattened together by callers (e.g. /branches), and two
 * different people can share a name at different branches. */
export function repeatJobCountsBySa(flags: RepeatJobFlag[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of flags) {
    if (!f.secondCloseSa) continue;
    const key = `${f.branch}|${f.secondCloseSa}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
