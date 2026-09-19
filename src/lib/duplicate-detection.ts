import { createHash } from "crypto";

/** Stable content hash for a parsed file's rows — two uploads of the same
 * file (or a resend of an earlier day's file under a new date) produce
 * identical rows in identical order, so this is exact-duplicate detection,
 * not fuzzy matching. Used to warn a branch admin before saving, not to
 * block them (see report-upload-card.tsx's confirm step). */
export function hashRows(rows: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** scom205 is a single cumulative-MTD row per day, not a row list — an
 * exact match on all four totals against the branch's most recent prior
 * upload is the same "this is yesterday's file again" signal, just
 * compared directly instead of via a hash. */
export function totalsMatch<T extends Record<string, number>>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  return keys.every((k) => a[k] === b[k]);
}
