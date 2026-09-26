import type { BranchReport } from "./report";

/**
 * Branches have been backfilling historical BA Tool / Part Sale / bill data
 * well before this date, but a branch admin's own view of their revenue is
 * restricted to this date onward (2026-09-26, at HQ's explicit request) —
 * HQ/regional/VP/CEO/Accounts still see the real figures for any date,
 * backfilled or not; only a branch account's own dashboard and Bills page
 * mask Total Revenue Stream (and every field that composes it) for a date
 * earlier than this. The date/month itself stays pickable — only the
 * revenue figure comes back hidden.
 */
export const BRANCH_REVENUE_VISIBLE_FROM = "2026-08-01";
export const BRANCH_REVENUE_VISIBLE_FROM_MONTH = "2026-08";

/** Fields that are null unless every BA-Tool input is present — same
 * null-guard convention as the rest of report.ts, so "hidden" reads exactly
 * like "not uploaded yet" rather than a new, distinguishable state. */
const REVENUE_NULL_FIELDS = [
  "gusPartsMtd",
  "gusLabourMtd",
  "bpuPartsMtd",
  "bpuLabourMtd",
  "externalSalesMtd",
  "externalSalesPctOfSprInternal",
  "totalRevenueStreamMtd",
] as const satisfies readonly (keyof BranchReport)[];

/** Scrap/used-oil revenue is typed as a plain `number` (0 when no bills,
 * never null — see report.ts) — masked to 0 rather than null so it stays
 * type-correct and reads as "no bills that month," not a new sentinel. */
const REVENUE_ZERO_FIELDS = [
  "scrapRevenueForTheDay",
  "scrapRevenueMtd",
  "usedOilRevenueForTheDay",
  "usedOilRevenueMtd",
] as const satisfies readonly (keyof BranchReport)[];

/** Nulls/zeros out Total Revenue Stream and every field that composes it,
 * for a set of branch rows dated before BRANCH_REVENUE_VISIBLE_FROM — a
 * no-op (returns `branches` unchanged) once that date is reached. Callers
 * decide whether to invoke this at all based on the viewer's role; this
 * function itself only ever looks at `date`. */
export function maskBranchRevenue(branches: BranchReport[], date: string): BranchReport[] {
  if (date >= BRANCH_REVENUE_VISIBLE_FROM) return branches;
  return branches.map((b) => {
    const masked = { ...b };
    for (const field of REVENUE_NULL_FIELDS) (masked[field] as number | null) = null;
    for (const field of REVENUE_ZERO_FIELDS) (masked[field] as number) = 0;
    return masked;
  });
}
