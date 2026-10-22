/**
 * The one report date every branch uploads for *right now* — computed, never
 * chosen. Before 2026-10-17, each branch picked the date on the upload form,
 * and around a weekend they'd diverge: the branch that only worked Saturday
 * filed under Sat, the one that also worked Sunday filed under Sun, so a
 * single upload round ended up split across two dates — Saturday was
 * rejected as a report date and its data folded into the following Sunday.
 *
 * That's gone now that the CTDMS extraction runs automatically every day
 * (Sat/Sun included), each run fetching the day before's data: Saturday's
 * run uploads Saturday's own data on Sunday, Sunday's run uploads Sunday's
 * own data on Monday, each filed under its own real date. The only thing
 * still walked back past is an **HQ-flagged holiday** (`report_holidays`,
 * edited at /data) — no branch files anything for those at all, so there's
 * nothing to date a report under.
 *
 * The BA Tool file is the one holdout: still a single HQ-uploaded,
 * company-wide file on Monday covering the whole weekend (see report.ts's
 * `computeBranchReport` — it's an MTD-cumulative snapshot, and
 * `loadPreviousSnapshot` already diffs against the most recent *prior*
 * snapshot in the month rather than strict yesterday, so the Sat+Sun BA Tool
 * movement lands on Sunday's date same as before; Saturday just has no
 * BA-Tool-sourced figures of its own).
 *
 * All arithmetic is UTC, matching yesterdayIso() in utils.ts (the codebase
 * has always treated the report date as a plain UTC `toISOString()` slice,
 * not IST-corrected — both sides of the upload lock must agree).
 */

function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function reportingDate(holidays: ReadonlySet<string>, now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Safety cap — HQ would have to flag ~3 weeks straight as holidays to hit it.
  for (let i = 0; i < 60; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (!holidays.has(isoOf(d))) return isoOf(d);
  }
  throw new Error("reportingDate: no valid date within 60 days — too many holidays flagged?");
}

/**
 * Default date for the *viewing* pages (CEO, dashboard, VP, accounts,
 * branch view, targets pages) — the most recent uploaded date that isn't
 * flagged as a holiday. `dates` must be ascending (as listSnapshotDates()
 * returns them). A holiday flagged after a few branches already filed under
 * it (see reportingDate()'s doc comment above) shouldn't keep surfacing as
 * everyone's default view just because its partial data exists — falls back
 * to the plain latest date if every uploaded date happens to be flagged.
 */
export function latestNonHolidayDate(dates: readonly string[], holidays: ReadonlySet<string>): string | undefined {
  for (let i = dates.length - 1; i >= 0; i--) {
    if (!holidays.has(dates[i])) return dates[i];
  }
  return dates.at(-1);
}

/** Why a given date isn't a valid report date, or null if it is one. */
export function invalidReportDateReason(iso: string, holidays: ReadonlySet<string>): string | null {
  if (iso.startsWith("2025-")) {
    const d = new Date(`${iso}T00:00:00Z`);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    if (d.getUTCDate() !== lastDayOfMonth) {
      return "not a month-end — for 2025, only the last day of the month can be uploaded";
    }
    return null;
  }

  if (holidays.has(iso)) return "flagged as a holiday";
  return null;
}

function isReportDate(iso: string, holidays: ReadonlySet<string>): boolean {
  return invalidReportDateReason(iso, holidays) === null;
}

/**
 * Pace-adjusted target math — "how far into the month are we" counted the
 * same way the reporting cadence counts it (every calendar day is a report
 * date except HQ-flagged holidays), not a flat day-of-month fraction. Used
 * to grade MTD against a target scaled to what should have landed by now,
 * rather than the full monthly figure. Currently unused — superseded by
 * sundayOffWorkingDaysElapsedInMonth/sundayOffWorkingDaysInMonth below
 * wherever this kind of pacing is actually wired up.
 */
export function workingDaysElapsedInMonth(dateIso: string, holidays: ReadonlySet<string>): number {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  let count = 0;
  for (let day = 1; day <= d.getUTCDate(); day++) {
    if (isReportDate(isoOf(new Date(Date.UTC(year, month, day))), holidays)) count++;
  }
  return count;
}

/** Same count, but for the whole month dateIso falls in — the pacing denominator. */
export function workingDaysInMonth(dateIso: string, holidays: ReadonlySet<string>): number {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    if (isReportDate(isoOf(new Date(Date.UTC(year, month, day))), holidays)) count++;
  }
  return count;
}

/**
 * Branches work Monday–Saturday, Sunday off; this pair counts that real
 * working-day calendar (minus the shared report_holidays) for MTD target
 * pacing that wants to reflect true elapsed working days. Added 2026-09-24
 * for the Central regional dashboard, now the one actually-used pacing pair
 * (see workingDaysElapsedInMonth/workingDaysInMonth above).
 */
const SUNDAY = 0;

function isSundayOffWorkingDay(iso: string, holidays: ReadonlySet<string>): boolean {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() !== SUNDAY && !holidays.has(iso);
}

export function sundayOffWorkingDaysElapsedInMonth(dateIso: string, holidays: ReadonlySet<string>): number {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  let count = 0;
  for (let day = 1; day <= d.getUTCDate(); day++) {
    if (isSundayOffWorkingDay(isoOf(new Date(Date.UTC(year, month, day))), holidays)) count++;
  }
  return count;
}

export function sundayOffWorkingDaysInMonth(dateIso: string, holidays: ReadonlySet<string>): number {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    if (isSundayOffWorkingDay(isoOf(new Date(Date.UTC(year, month, day))), holidays)) count++;
  }
  return count;
}
