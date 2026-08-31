/**
 * Run-rate / pacing math — "are we on track to hit target by month-end,"
 * not just "what % of target are we at today." Pure functions, no DB access,
 * safe to call from client or server components. All inputs/outputs share
 * whatever unit the caller's actual/target are already in (Rs, units, %).
 */
export type Pace = {
  daysElapsed: number;
  daysInMonth: number;
  daysRemaining: number;
  /** actual ÷ days elapsed so far this month. */
  runRatePerDay: number | null;
  /** (target − actual) ÷ days remaining — the pace needed for the rest of the month to still hit target. */
  requiredRatePerDay: number | null;
  /** target − actual. Negative means already past target. */
  gap: number | null;
  /** Where the metric lands by month-end if the current run rate holds steady. */
  projectedEom: number | null;
  /** projectedEom ÷ target. */
  projectedAchievementRatio: number | null;
};

export function computePace(date: string, actual: number | null, target: number | null): Pace {
  const d = new Date(`${date}T00:00:00Z`);
  const daysElapsed = d.getUTCDate();
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

  const runRatePerDay = actual !== null && daysElapsed > 0 ? actual / daysElapsed : null;
  const gap = actual !== null && target !== null ? target - actual : null;
  const requiredRatePerDay = gap === null ? null : daysRemaining > 0 ? gap / daysRemaining : gap;
  const projectedEom = runRatePerDay !== null ? runRatePerDay * daysInMonth : null;
  const projectedAchievementRatio = projectedEom !== null && target !== null && target !== 0 ? projectedEom / target : null;

  return { daysElapsed, daysInMonth, daysRemaining, runRatePerDay, requiredRatePerDay, gap, projectedEom, projectedAchievementRatio };
}
