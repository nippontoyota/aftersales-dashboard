export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * "Yesterday" as an ISO date (YYYY-MM-DD), UTC-based — matches the
 * convention the upload forms have always used for "today" (a plain
 * `toISOString().slice(0, 10)`, not corrected for IST). Branches always
 * upload today for the previous day's report (2026-09-01, at the user's
 * request — this used to be a "today" default the user had to manually
 * change every time, which silently mis-bucketed the last upload of every
 * month into the wrong month's cumulative). Used as the default value for
 * every report-date picker AND as the date the server checks for the
 * upload lock — both sides must agree on what "yesterday" means.
 */
export function yesterdayIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
