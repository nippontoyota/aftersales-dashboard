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
 */

export const GS_BAYS: Readonly<Record<string, number>> = {
  CO01A: 24,
  CO01B: 24,
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

/** GUS jobs per GS bay per working day — flat across every branch, per the workbook. */
export const GS_STANDARD_PRODUCTIVITY_PER_BAY_PER_DAY = 5.85;

/**
 * Annual ideal BPU capacity per branch (bays x job-severity-mix-weighted
 * ideal cycle time x working hours) — taken straight from the workbook's
 * "2025 ideal BPU" column rather than re-derived here, since the underlying
 * job-mix (General/Small/Light/Medium/Heavy) isn't in the daily pipeline.
 */
export const BP_IDEAL_ANNUAL: Readonly<Record<string, number>> = {
  CO01A: 4161.6,
  CO01B: 979.2,
  CO01E: 5630.4,
  IR01A: 1224,
  KL01A: 979.2,
  KL01B: 4161.6,
  KT01A: 2203.2,
  KT01B: 2692.8,
  KY01A: 2937.6,
  MV01A: 1713.6,
  PH01A: 1224,
  TI01A: 5140.8,
  TI01B: 979.2,
  TI01C: 1224,
  TL01A: 1224,
  TR01A: 734.4,
  TR01B: 3427.2,
  TR01C: 2937.6,
};

/** Working days in a full year, per the same workbook — denominator for BP_IDEAL_ANNUAL. */
export const ANNUAL_WORKING_DAYS = 272;

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

/** BP bay utilization: actual BPU ROs so far this month vs. that branch's
 * ideal annual BPU capacity, prorated down to the same elapsed working days. */
export function bpBayUtilization(branch: string, bpuRoMtd: number | null, workingDaysElapsed: number): BayUtilization | null {
  const bays = BP_BAYS[branch];
  const idealAnnual = BP_IDEAL_ANNUAL[branch];
  if (!bays || !idealAnnual || bpuRoMtd === null || workingDaysElapsed <= 0) return null;
  const idealRoMtd = (idealAnnual / ANNUAL_WORKING_DAYS) * workingDaysElapsed;
  return { actualRoMtd: bpuRoMtd, bays, idealRoMtd, utilizationPct: idealRoMtd > 0 ? bpuRoMtd / idealRoMtd : 0 };
}

/** Group/region roll-up: sums actual ROs and ideal capacity across branches,
 * then ratios — never an average of per-branch percentages. */
export function aggregateGsUtilization(
  rows: { branch: string; gusRoMtd: number | null }[],
  workingDaysElapsed: number,
): { utilizationPct: number; actualRoMtd: number; idealRoMtd: number } | null {
  let actual = 0;
  let ideal = 0;
  let any = false;
  for (const r of rows) {
    const u = gsBayUtilization(r.branch, r.gusRoMtd, workingDaysElapsed);
    if (!u) continue;
    any = true;
    actual += u.actualRoMtd;
    ideal += u.idealRoMtd;
  }
  return any && ideal > 0 ? { utilizationPct: actual / ideal, actualRoMtd: actual, idealRoMtd: ideal } : null;
}

export function aggregateBpUtilization(
  rows: { branch: string; bpuRoMtd: number | null }[],
  workingDaysElapsed: number,
): { utilizationPct: number; actualRoMtd: number; idealRoMtd: number } | null {
  let actual = 0;
  let ideal = 0;
  let any = false;
  for (const r of rows) {
    const u = bpBayUtilization(r.branch, r.bpuRoMtd, workingDaysElapsed);
    if (!u) continue;
    any = true;
    actual += u.actualRoMtd;
    ideal += u.idealRoMtd;
  }
  return any && ideal > 0 ? { utilizationPct: actual / ideal, actualRoMtd: actual, idealRoMtd: ideal } : null;
}
