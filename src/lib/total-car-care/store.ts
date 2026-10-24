import type { PoolClient } from "pg";
import { pool } from "../db";

/** total_car_care_treatments_daily — one row per (branch, date). Upsert on
 * (date, branch): a recompute (triggered by a Service Info GS or BP
 * upload touching that date) always overwrites with a full recompute,
 * never a partial update — same convention as unique_vin_vas_daily. */
export type TotalCarCareSnapshot = { date: string; branch: string; count: number };

export async function saveTotalCarCareTreatmentsDaily(params: TotalCarCareSnapshot, client?: PoolClient): Promise<void> {
  await (client ?? pool).query(
    `insert into total_car_care_treatments_daily (date, branch, count, computed_at)
     values ($1, $2, $3, now())
     on conflict (date, branch) do update set count = excluded.count, computed_at = excluded.computed_at`,
    [params.date, params.branch, params.count]
  );
}

export async function loadTotalCarCareTreatmentsForDate(date: string): Promise<TotalCarCareSnapshot[]> {
  const { rows } = await pool.query<{ date: string; branch: string; count: number }>(
    `select date::text as date, branch, count from total_car_care_treatments_daily where date = $1`,
    [date]
  );
  return rows.map((r) => ({ date: r.date, branch: r.branch, count: Number(r.count) }));
}

/** Every branch's rows in the same calendar month as `date`, up to and
 * including it — the MTD accumulation report.ts sums, same shape as every
 * other per-day-summed report's loader. */
export async function loadAllTotalCarCareTreatmentsForMonthUpTo(date: string): Promise<TotalCarCareSnapshot[]> {
  const monthPrefix = date.slice(0, 7);
  const { rows } = await pool.query<{ date: string; branch: string; count: number }>(
    `select date::text as date, branch, count from total_car_care_treatments_daily where date::text like $1 and date <= $2`,
    [`${monthPrefix}%`, date]
  );
  return rows.map((r) => ({ date: r.date, branch: r.branch, count: Number(r.count) }));
}
