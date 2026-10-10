import type { PoolClient } from "pg";
import { pool } from "../db";
import type { VasRevenueRealResult } from "./compute";

/** vas_revenue_real — one row per (branch, date), 2026-10-01 onwards only
 * (see compute.ts's VAS_REAL_CUTOVER_DATE and db/schema.sql's doc comment).
 * Upsert on (date, branch): a recompute (triggered by a Service Info or
 * Labour Sales Report upload touching that date) always overwrites. */
export type VasRevenueRealSnapshot = { date: string; branch: string; vasRevenue: number };

export async function saveVasRevenueReal(
  params: { date: string; branch: string } & VasRevenueRealResult,
  client?: PoolClient
): Promise<void> {
  await (client ?? pool).query(
    `insert into vas_revenue_real (date, branch, vas_revenue, matched_rows, fallback_rows, excluded_rows, used_day_aggregate_fallback, computed_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (date, branch) do update set
       vas_revenue = excluded.vas_revenue,
       matched_rows = excluded.matched_rows,
       fallback_rows = excluded.fallback_rows,
       excluded_rows = excluded.excluded_rows,
       used_day_aggregate_fallback = excluded.used_day_aggregate_fallback,
       computed_at = excluded.computed_at`,
    [params.date, params.branch, params.vasRevenue, params.matchedRows, params.fallbackRows, params.excludedRows, params.usedDayAggregateFallback]
  );
}

/** Every branch's rows in the same calendar month as `date`, up to and
 * including it — the MTD accumulation report.ts sums, same shape as every
 * other per-day-summed report's loader. */
export async function loadAllVasRevenueRealForMonthUpTo(date: string): Promise<VasRevenueRealSnapshot[]> {
  const monthPrefix = date.slice(0, 7);
  const { rows } = await pool.query<{ date: string; branch: string; vas_revenue: string }>(
    `select date::text as date, branch, vas_revenue from vas_revenue_real where date::text like $1 and date <= $2`,
    [`${monthPrefix}%`, date]
  );
  return rows.map((r) => ({ date: r.date, branch: r.branch, vasRevenue: Number(r.vas_revenue) }));
}

/**
 * Overrides each snapshot's `counts.vasRevenue` with the real (Labour Sales
 * Report) amount wherever one's on file for that exact (date, branch) —
 * everything else on the snapshot (wheelBalancing, brakeSkimming, etc.)
 * passes through untouched. A snapshot with no matching real row (before
 * the cutover, or a date vas_revenue_real hasn't been computed for yet)
 * keeps its original price-list-based vasRevenue, unchanged.
 *
 * The single point every VAS-revenue consumer that reads ServiceInfoSnapshot
 * directly (trend.ts's computeVasTrendSeries, via dashboard-data.ts) should
 * be patched through — report.ts's own MTD total takes a different path
 * (sums vas_revenue_real directly, see computeBranchReport), but this keeps
 * every *other* reader of these snapshots in sync with it without needing
 * its own cutover-aware branch.
 */
export function applyVasRevenueRealOverride<T extends { date: string; branch: string; counts: { vasRevenue: number } }>(
  snapshots: T[],
  real: VasRevenueRealSnapshot[]
): T[] {
  if (real.length === 0) return snapshots;
  const byKey = new Map(real.map((r) => [`${r.date}|${r.branch}`, r.vasRevenue]));
  return snapshots.map((s) => {
    const override = byKey.get(`${s.date}|${s.branch}`);
    return override === undefined ? s : { ...s, counts: { ...s.counts, vasRevenue: override } };
  });
}
