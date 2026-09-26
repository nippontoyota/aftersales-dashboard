import { pool } from "../db";

export type RegionRevenueTargets = { gsTarget: number; bpTarget: number; extTarget: number };

/** This month's GS/BP/Ext Sales targets, one row per branch that has them —
 * a branch with none simply has no entry (its dashboard block shows "not
 * set" rather than a zero target). */
export async function loadRegionRevenueTargets(month: string, branches: readonly string[]): Promise<Map<string, RegionRevenueTargets>> {
  const { rows } = await pool.query<{ branch: string; gs_target: string; bp_target: string; ext_target: string }>(
    "select branch, gs_target, bp_target, ext_target from region_revenue_targets where month = $1 and branch = any($2::text[])",
    [month, [...branches]],
  );
  return new Map(rows.map((r) => [r.branch, { gsTarget: Number(r.gs_target), bpTarget: Number(r.bp_target), extTarget: Number(r.ext_target) }]));
}

/** Upserts one branch's targets for the month — a regional manager can save
 * one branch at a time without clobbering the others' already-saved values
 * (unlike incentive_slab_targets' whole-month-replace, there's no source
 * file here to replace from, just a form). */
export async function saveRegionRevenueTargets(month: string, branch: string, targets: RegionRevenueTargets, setBy: string): Promise<void> {
  await pool.query(
    `insert into region_revenue_targets (month, branch, gs_target, bp_target, ext_target, set_by, set_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (month, branch) do update set
       gs_target = excluded.gs_target,
       bp_target = excluded.bp_target,
       ext_target = excluded.ext_target,
       set_by = excluded.set_by,
       set_at = excluded.set_at`,
    [month, branch, targets.gsTarget, targets.bpTarget, targets.extTarget, setBy],
  );
}
