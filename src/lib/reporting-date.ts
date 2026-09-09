/**
 * The one report date every branch uploads for *right now* — computed, never
 * chosen. Before this, each branch picked the date on the upload form, and
 * around a weekend or holiday they'd diverge: the branch that only worked
 * Saturday filed under Sat, the one that also worked Sunday filed under Sun,
 * so a single upload round ended up split across two dates.
 *
 * The rule: walk back from yesterday and return the first date that is
 * neither
 *   - a **Saturday** — a working day, but its data only reaches us on Monday,
 *     folded in with Sunday's; the canonical date for that round is the
 *     Sunday, not the Saturday; nor
 *   - an **HQ-flagged holiday** (`report_holidays`, edited at /data).
 *
 * Sundays count as normal report dates — some branches work them, and
 * Monday's upload is filed under the Sunday (covering Sat + Sun). Uniformity
 * across branches matters more than each calendar day being exactly right;
 * MTD totals are unaffected either way.
 *
 * All arithmetic is UTC, matching yesterdayIso() in utils.ts (the codebase
 * has always treated the report date as a plain UTC `toISOString()` slice,
 * not IST-corrected — both sides of the upload lock must agree).
 */

const SATURDAY = 6;

function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function reportingDate(holidays: ReadonlySet<string>, now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Safety cap — HQ would have to flag ~3 weeks straight as holidays to hit it.
  for (let i = 0; i < 60; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (d.getUTCDay() !== SATURDAY && !holidays.has(isoOf(d))) return isoOf(d);
  }
  throw new Error("reportingDate: no valid date within 60 days — too many holidays flagged?");
}

/** Why a given date isn't a valid report date, or null if it is one. */
export function invalidReportDateReason(iso: string, holidays: ReadonlySet<string>): string | null {
  if (holidays.has(iso)) return "flagged as a holiday";
  if (new Date(`${iso}T00:00:00Z`).getUTCDay() === SATURDAY) return "a Saturday — its data reaches us Monday, filed under the Sunday";
  return null;
}
