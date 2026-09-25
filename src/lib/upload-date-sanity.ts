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

/** Which slash-date convention a report type's text dates use — confirmed
 * 2026-09-25 by sampling real stored data per report type, after a Part
 * Sale upload was wrongly rejected: "15/09/2026" and "23/07/2026" (day-first,
 * unambiguous since no month is > 12) for Part Sale and SSRV089, in both
 * their .csv and .xlsx exports alike, vs. "09/15/2026" (month-first) for
 * Service Info's .xlsx export — the convention is per report TEMPLATE, not
 * per file extension. */
export type SlashDateFormat = "MM/DD/YYYY" | "DD/MM/YYYY";

/**
 * These reports' date columns come through as either a raw Excel serial
 * number (e.g. "46023", from .xlsx/.xls uploads) or slash-separated text
 * (from .csv uploads, and sometimes .xlsx too) — confirmed 2026-09-19 by
 * sampling real Service Info data across branches, no single format holds.
 * `format` picks which slash convention to apply to the text case; see
 * SlashDateFormat's doc comment for how that's determined per report type.
 * Returns a YYYY-MM string (just the month, which is all these checks need)
 * or null if unparseable/blank.
 */
export function parseDateToYearMonth(raw: unknown, format: SlashDateFormat = "MM/DD/YYYY"): string | null {
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

  // Slash-separated text (also tolerates single-digit day/month)
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, first, second, yyyy] = match;
    const mm = format === "MM/DD/YYYY" ? first : second;
    return `${yyyy}-${mm.padStart(2, "0")}`;
  }

  return null;
}

/**
 * Finds the slash-date convention from the file's OWN data rather than
 * trusting a single fixed assumption per report type (2026-09-25, after a
 * second incident — a Cost & Sales Report backfill was wrongly rejected
 * even after SSRV089 had already been pinned to day-first 2026-09-25: that
 * assumption held for every file sampled at the time, but not for this
 * one, and a report "type" turns out not to guarantee one convention
 * across every branch's export/backfill). A day/month pair is unambiguous
 * whenever one component is > 12 — that component can only be a day, never
 * a month — so the first such row in the file settles it. Only falls back
 * to `fallback` (the report type's usual convention) when every row in the
 * file is ambiguous (day ≤ 12 throughout, e.g. a backfill confined to the
 * first third of a month) — there's no way to tell from the data alone
 * then.
 */
function detectSlashDateFormat(rawRows: Record<string, unknown>[], dateColumn: string, fallback: SlashDateFormat): SlashDateFormat {
  for (const row of rawRows) {
    const str = String(row[dateColumn] ?? "").trim();
    const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > 12 && second <= 12) return "DD/MM/YYYY";
    if (second > 12 && first <= 12) return "MM/DD/YYYY";
  }
  return fallback;
}

export type DateSanityResult = { ok: true } | { ok: false; error: string };

/**
 * Rejects a file whose rows mostly belong to a different calendar month
 * than the date the uploader picked. `itemNoun` names what's being counted
 * in the error message (e.g. "invoice", "row", "sale") — plural is formed
 * by appending "s". `fallbackFormat` is the report type's usual slash-date
 * convention, used only when the file's own data can't settle it (see
 * detectSlashDateFormat above).
 */
export function checkDateColumnSanity(
  rawRows: Record<string, unknown>[],
  dateColumn: string,
  claimedDate: string,
  itemNoun = "row",
  fallbackFormat: SlashDateFormat = "MM/DD/YYYY"
): DateSanityResult {
  const format = detectSlashDateFormat(rawRows, dateColumn, fallbackFormat);
  const claimedMonth = claimedDate.slice(0, 7);
  let withDate = 0;
  let matching = 0;
  const monthCounts = new Map<string, number>();
  let sawColumn = false;

  for (const row of rawRows) {
    if (dateColumn in row) sawColumn = true;
    const month = parseDateToYearMonth(row[dateColumn], format);
    if (!month) continue;
    withDate++;
    if (month === claimedMonth) matching++;
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  }

  // The column exists but every value in it is blank/unparseable — don't
  // block on a signal we don't have; that's a data-quality issue in the
  // file itself, not evidence it's the wrong file.
  if (withDate === 0 && sawColumn) return { ok: true };

  // The column doesn't exist AT ALL (2026-09-24, after a CO01B test upload:
  // an old-format Parts Sales export used "Sale Date" instead of the current
  // template's "SaleDate", so every row silently missed the check entirely
  // and a stray external-sales figure from an unrelated Feb 2025 file landed
  // in real data). A wholly missing expected column is a much stronger "this
  // might be the wrong report" signal than a few blank cells, and one worth
  // rejecting rather than silently trusting.
  if (withDate === 0 && !sawColumn) {
    return {
      ok: false,
      error: `Couldn't find a "${dateColumn}" column in this file — is this the right report? Check the file and try again.`,
    };
  }

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
