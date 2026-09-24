/**
 * Generic month-level date-sanity check, shared across every report type
 * that has a per-row date column (originally built 2026-09-19 for Service
 * Info alone — see service-info/upload-validation.ts's git history — after
 * the CO01A/KL01A incidents; generalized 2026-09-24 to also cover Part Sale
 * and SSRV089, after TL01A uploaded a whole scom205 file from the wrong
 * year). Checks at the MONTH level, not day level, on purpose: a legitimate
 * multi-day backfill or a branch combining several days into one export
 * (confirmed as a real pattern for Part Sale — see its own
 * upload-validation.ts) still has every row in the SAME month as the picked
 * date, so a month-level check never rejects it. Only a file whose invoices
 * mostly belong to a genuinely different month is rejected.
 */

/** Matches numbers with thousands separators, e.g. "1,529" — same pattern
 * ba-tool/parse.ts uses for the same reason (Number() rejects the comma). */
const THOUSANDS_SEPARATED = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;

/**
 * These report's date columns come through as either a raw Excel serial
 * number (e.g. "46023", from .xlsx/.xls uploads) or "MM/DD/YYYY" text (from
 * .csv uploads) — confirmed 2026-09-19 by sampling real Service Info data
 * across branches, no single format holds; the same two formats are used by
 * every other report type's date columns. Returns a YYYY-MM string (just
 * the month, which is all these checks need) or null if unparseable/blank.
 */
export function parseDateToYearMonth(raw: unknown): string | null {
  const str = String(raw ?? "").trim();
  if (!str) return null;

  // Excel serial date: days since 1899-12-30. 25569 is the offset to the
  // Unix epoch (1970-01-01) — same constant used everywhere else in this
  // codebase that has had to make this exact conversion.
  const asNumber = THOUSANDS_SEPARATED.test(str) ? Number(str.replace(/,/g, "")) : Number(str);
  if (Number.isFinite(asNumber) && asNumber > 1000) {
    const utcDays = Math.floor(asNumber - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 7);
  }

  // "MM/DD/YYYY" (also tolerates single-digit month/day)
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, mm, , yyyy] = match;
    return `${yyyy}-${mm.padStart(2, "0")}`;
  }

  return null;
}

export type DateSanityResult = { ok: true } | { ok: false; error: string };

/**
 * Rejects a file whose rows mostly belong to a different calendar month
 * than the date the uploader picked. `itemNoun` names what's being counted
 * in the error message (e.g. "invoice", "row", "sale") — plural is formed
 * by appending "s".
 */
export function checkDateColumnSanity(
  rawRows: Record<string, unknown>[],
  dateColumn: string,
  claimedDate: string,
  itemNoun = "row"
): DateSanityResult {
  const claimedMonth = claimedDate.slice(0, 7);
  let withDate = 0;
  let matching = 0;
  const monthCounts = new Map<string, number>();

  for (const row of rawRows) {
    const month = parseDateToYearMonth(row[dateColumn]);
    if (!month) continue;
    withDate++;
    if (month === claimedMonth) matching++;
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  }

  // Nothing to check against (every row blank/unparseable) — don't block on
  // a signal we don't have.
  if (withDate === 0) return { ok: true };

  if (matching / withDate >= 0.5) return { ok: true };

  const topMonths = [...monthCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([month, count]) => `${month} (${count} ${itemNoun}${count === 1 ? "" : "s"})`)
    .join(", ");

  return {
    ok: false,
    error: `This file's ${itemNoun}s don't match ${claimedDate} — most are dated ${topMonths}. Check the date and try again, or if this is a historical backfill, tag it with a date in the month the ${itemNoun}s actually belong to.`,
  };
}
