import type { Scom205Totals } from "./parse";
import { loadAllScom205SnapshotsBefore } from "./store";

/**
 * Two safety checks added 2026-09-24, after TL01A uploaded a genuine
 * September 2024 KPI export under today's date — its own header literally
 * read "For the month of September 2024", and its cumulative totals were
 * lower than the correct file already on file for an earlier date this
 * month, but nothing caught either signal before this (the existing
 * duplicate check only catches an EXACT total match against a prior upload,
 * not "these totals are for a wrong file entirely").
 */

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export type DateSanityResult = { ok: true } | { ok: false; error: string };

/**
 * Part 1 — the report's own "For the month of <Month> <Year>" header (row 1
 * in every real file sampled, first cell) must match the picked date's
 * month/year. Scans the first few rows rather than hardcoding row 1, in
 * case a file's layout ever shifts by a row. A file with no such header at
 * all isn't blocked on a signal we don't have.
 */
export function checkPeriodHeaderSanity(rawRows: unknown[][], claimedDate: string): DateSanityResult {
  const claimedMonth = claimedDate.slice(0, 7);

  for (const row of rawRows.slice(0, 5)) {
    const cell = String(row?.[0] ?? "");
    const match = cell.match(/for the month of\s+([a-z]+)\s+(\d{4})/i);
    if (!match) continue;

    const monthIndex = MONTH_NAMES.indexOf(match[1].toLowerCase());
    if (monthIndex === -1) continue;

    const fileMonth = `${match[2]}-${String(monthIndex + 1).padStart(2, "0")}`;
    if (fileMonth === claimedMonth) return { ok: true };

    return {
      ok: false,
      error: `This file's own header says "${cell.trim()}" — that doesn't match ${claimedDate}. Check you picked the right file and try again.`,
    };
  }

  return { ok: true };
}

export type GrowthResult = { ok: true } | { ok: false; error: string };

const TOTAL_LABELS: Record<keyof Scom205Totals, string> = {
  gusSpRevMtd: "GUS Parts",
  gusLabRevMtd: "GUS Labour",
  bpuSpRevMtd: "BPU Parts",
  bpuLabRevMtd: "BPU Labour",
};

/**
 * Part 2 — scom205's four totals are cumulative-MTD, so a genuine file for
 * a later date this month can never show a LOWER total than an earlier
 * date's file already on record — any decrease means either a wrong-period
 * file (this incident) or a stale/older file resent under today's date. No
 * tolerance: the DMS report is meant to already be net of cancellations as
 * of its own pull time (see cancellation-adjustment.ts's doc comment), so a
 * correct file's totals should never legitimately dip mid-month.
 */
export async function checkGrowth(branch: string, date: string, newTotals: Scom205Totals): Promise<GrowthResult> {
  const month = date.slice(0, 7);
  const priorThisMonth = (await loadAllScom205SnapshotsBefore(date, branch)).filter((s) => s.date.slice(0, 7) === month);
  if (priorThisMonth.length === 0) return { ok: true };

  const mostRecent = priorThisMonth.reduce((latest, s) => (s.date > latest.date ? s : latest));

  const drops = (Object.keys(TOTAL_LABELS) as (keyof Scom205Totals)[])
    .filter((key) => newTotals[key] < mostRecent.totals[key])
    .map((key) => `${TOTAL_LABELS[key]} ₹${mostRecent.totals[key].toLocaleString("en-IN")} → ₹${newTotals[key].toLocaleString("en-IN")}`);

  if (drops.length === 0) return { ok: true };

  return {
    ok: false,
    error: `This file's cumulative totals are lower than ${mostRecent.date}'s upload (${drops.join(", ")}) — a genuine MTD figure should never decrease mid-month. Check this is really ${date}'s file, not an older one.`,
  };
}
