/**
 * Bay counts and standard-productivity constants for GS/BP bay utilization —
 * sourced from HQ's "2025 Capacity Utilization" workbook (GS Capacity / BP
 * Capacity sheets), pulled once and hardcoded rather than re-uploaded, since
 * bay counts change rarely. GS bays are absent for Body & Paint-only
 * branches (see BODY_PAINT_ONLY_BRANCHES in report.ts) — they have no
 * general-service bays at all.
 *
 * CO01B's BP bays were reassigned to CO01E (2026-09-11, user-confirmed): the
 * workbook's original CO01B row (27 bays / 6609.6 ideal BPU) is split 4/23
 * by bay count between the two branches — CO01E has no per-branch job-mix
 * data of its own yet, so its ideal BPU is prorated the same way.
 *
 * CO01B's GS bay count corrected from 24 to 20 (2026-10-01, user-confirmed —
 * the workbook figure was wrong; company-wide GS bays is 164, not 168).
 */

export const GS_BAYS: Readonly<Record<string, number>> = {
  CO01A: 24,
  CO01B: 20,
  IR01A: 5,
  KL01A: 10,
  KT01A: 10,
  KT01B: 11,
  KY01A: 12,
  MV01A: 8,
  PH01A: 5,
  TI01A: 17,
  TI01B: 4,
  TI01C: 5,
  TL01A: 5,
  TR01A: 16,
  TR01C: 12,
};

export const BP_BAYS: Readonly<Record<string, number>> = {
  CO01A: 17,
  CO01B: 4,
  CO01E: 23,
  IR01A: 5,
  KL01A: 4,
  KL01B: 17,
  KT01A: 9,
  KT01B: 11,
  KY01A: 12,
  MV01A: 7,
  PH01A: 5,
  TI01A: 21,
  TI01B: 4,
  TI01C: 5,
  TL01A: 5,
  TR01A: 3,
  TR01B: 14,
  TR01C: 12,
};

/** GUS jobs per GS bay per working day — flat across every branch, per the workbook.
 * Raised from 5.85 to 6.3, 2026-11-12 (user-confirmed revised target). */
export const GS_STANDARD_PRODUCTIVITY_PER_BAY_PER_DAY = 6.3;

/** BPU per BP bay per working day — flat across every branch, same as GS above.
 * Raised from 0.9 to 1.04, 2026-11-12 (user-confirmed revised target). Previously
 * this was baked into a hardcoded per-branch annual table (bays x 0.9 x 272 working
 * days, confirmed to match every branch's workbook figure exactly) — replaced with
 * this flat rate so a future target change is a one-line edit, not 17 recalculated
 * numbers. */
export const BP_STANDARD_PRODUCTIVITY_PER_BAY_PER_DAY = 1.04;

export type BayUtilization = {
  actualRoMtd: number;
  bays: number;
  idealRoMtd: number;
  utilizationPct: number;
};

/** GS bay utilization: actual GUS ROs so far this month vs. ideal capacity
 * for the same number of elapsed working days. Null when the branch has no
 * GS bays (Body & Paint-only) or there's no data yet. */
export function gsBayUtilization(branch: string, gusRoMtd: number | null, workingDaysElapsed: number): BayUtilization | null {
  const bays = GS_BAYS[branch];
  if (!bays || gusRoMtd === null || workingDaysElapsed <= 0) return null;
  const idealRoMtd = bays * GS_STANDARD_PRODUCTIVITY_PER_BAY_PER_DAY * workingDaysElapsed;
  return { actualRoMtd: gusRoMtd, bays, idealRoMtd, utilizationPct: idealRoMtd > 0 ? gusRoMtd / idealRoMtd : 0 };
}

/** BP bay utilization: actual BPU ROs so far this month vs. ideal capacity
 * for the same number of elapsed working days. */
export function bpBayUtilization(branch: string, bpuRoMtd: number | null, workingDaysElapsed: number): BayUtilization | null {
  const bays = BP_BAYS[branch];
  if (!bays || bpuRoMtd === null || workingDaysElapsed <= 0) return null;
  const idealRoMtd = bays * BP_STANDARD_PRODUCTIVITY_PER_BAY_PER_DAY * workingDaysElapsed;
  return { actualRoMtd: bpuRoMtd, bays, idealRoMtd, utilizationPct: idealRoMtd > 0 ? bpuRoMtd / idealRoMtd : 0 };
}

/**
 * Group/region roll-up: sums actual ROs and ideal capacity across a set of
 * already-computed per-branch utilizations, then ratios once — never an
 * average of per-branch percentages, and never re-derives each branch's
 * BayUtilization from scratch (the caller computes each branch's once — see
 * ceo-data.ts — and reuses that same object here and for the branch table,
 * rather than three independent recomputations of the same numbers).
 */
export function sumBayUtilization(
  utils: (BayUtilization | null)[]
): { utilizationPct: number; actualRoMtd: number; idealRoMtd: number; bays: number } | null {
  let actual = 0;
  let ideal = 0;
  let bays = 0;
  let any = false;
  for (const u of utils) {
    if (!u) continue;
    any = true;
    actual += u.actualRoMtd;
    ideal += u.idealRoMtd;
    bays += u.bays;
  }
  return any && ideal > 0 ? { utilizationPct: actual / ideal, actualRoMtd: actual, idealRoMtd: ideal, bays } : null;
}
