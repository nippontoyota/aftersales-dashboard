import type { AchievementTone } from "./aggregate";

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

/**
 * Same shape as Pace above, but paced over the calendar YEAR instead of the
 * month — "at this rate, where do we land by December" (2026-09-26, for the
 * Central region's TKM Targets build). `achievedYtd` is the sum of every
 * closed month's final achieved figure plus the current month's live MTD
 * figure; `annualTarget` is the sum of all 12 months' own targets. Treats
 * the current month as fully "elapsed" for the run-rate average (same
 * convention as Pace treating today as a whole elapsed day) — simple linear
 * month-based pacing, not seasonally weighted.
 */
export type AnnualPace = {
  monthsElapsed: number;
  monthsInYear: number;
  monthsRemaining: number;
  runRatePerMonth: number | null;
  requiredRatePerMonth: number | null;
  gap: number | null;
  projectedYearEnd: number | null;
  projectedAchievementRatio: number | null;
};

export function computeAnnualPace(date: string, achievedYtd: number | null, annualTarget: number | null): AnnualPace {
  const d = new Date(`${date}T00:00:00Z`);
  const monthsElapsed = d.getUTCMonth() + 1;
  const monthsInYear = 12;
  const monthsRemaining = Math.max(0, monthsInYear - monthsElapsed);

  const runRatePerMonth = achievedYtd !== null && monthsElapsed > 0 ? achievedYtd / monthsElapsed : null;
  const gap = achievedYtd !== null && annualTarget !== null ? annualTarget - achievedYtd : null;
  const requiredRatePerMonth = gap === null ? null : monthsRemaining > 0 ? gap / monthsRemaining : gap;
  const projectedYearEnd = runRatePerMonth !== null ? runRatePerMonth * monthsInYear : null;
  const projectedAchievementRatio = projectedYearEnd !== null && annualTarget !== null && annualTarget !== 0 ? projectedYearEnd / annualTarget : null;

  return { monthsElapsed, monthsInYear, monthsRemaining, runRatePerMonth, requiredRatePerMonth, gap, projectedYearEnd, projectedAchievementRatio };
}

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

/**
 * Progress-to-date ratio: how far into the month's *target* the branch/KPI
 * should be by `date`, if the target were being hit evenly every calendar
 * day (elapsed days ÷ days in month — calendar days, not working days;
 * confirmed with the user 2026-09-19, consistent with computePace above).
 * Used as the denominator for pace-vs-expected-pace comparisons (heatmap
 * colour, KPI/region "on track" status) — kept separate from computePace so
 * callers that only need this one number don't have to supply actual/target.
 */
export function expectedProgressRatio(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const daysElapsed = d.getUTCDate();
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return daysInMonth > 0 ? daysElapsed / daysInMonth : 0;
}

/**
 * "Are we on track as of today" — not "what % of the full month target have
 * we hit" (that's achievementRatio/achievementTone in aggregate.ts, and
 * stays mostly red until late in the month by design). paceRatio compares
 * the achievement-%-so-far against the expected-progress-%-so-far, so a
 * branch running exactly on schedule reads 100% on day 5 same as day 25.
 * Returns null when there's no target or no actual to grade (see
 * hasActualWithoutTarget in aggregate.ts for that case).
 */
export function paceRatio(date: string, actual: number | null, target: number | null): number | null {
  if (actual === null || target === null || target === 0) return null;
  const expected = expectedProgressRatio(date);
  if (expected <= 0) return null;
  return actual / target / expected;
}

/**
 * Same three-band shape as achievementTone (good/warn/critical/neutral), but
 * graded against expected pace-to-date rather than the full-month target —
 * this is the ONE pace methodology shared by KPI cards, region cards, the
 * heatmap, and insights (confirmed with the user 2026-09-19: never a
 * different rule in different places). Slightly more forgiving than
 * achievementTone's 90% amber line (85% here) since a pace ratio is noisier
 * day to day — one slow day early in the month swings it further than the
 * same slip would move a full-month ratio.
 */
export function paceTone(date: string, actual: number | null, target: number | null): AchievementTone {
  const ratio = paceRatio(date, actual, target);
  if (ratio === null) return "neutral";
  if (ratio >= 1) return "good";
  if (ratio >= 0.85) return "warn";
  return "critical";
}
