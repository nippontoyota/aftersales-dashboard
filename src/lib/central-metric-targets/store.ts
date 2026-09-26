import { pool } from "../db";

/** TKM's own official target categories for the Central region (2026-09-26,
 * replacing the Central RM's separate BusinessTracker Excel) — see
 * db/schema.sql's central_metric_targets table doc comment for how this
 * relates to region_revenue_targets (GS/BP/Ext Sales, a different, higher-
 * level set of targets that already has its own table/form). */
export type CentralMetricTargets = {
  bpuTarget: number;
  offtakeTarget: number;
  sprInternalTarget: number;
  sprExternalTarget: number;
  pmOcTarget: number;
  batteryTarget: number;
  tyreTarget: number;
};

export async function loadCentralMetricTargets(month: string, branches: readonly string[]): Promise<Map<string, CentralMetricTargets>> {
  const { rows } = await pool.query<{
    branch: string;
    bpu_target: string;
    offtake_target: string;
    spr_internal_target: string;
    spr_external_target: string;
    pm_oc_target: string;
    battery_target: string;
    tyre_target: string;
  }>(
    `select branch, bpu_target, offtake_target, spr_internal_target, spr_external_target, pm_oc_target, battery_target, tyre_target
       from central_metric_targets where month = $1 and branch = any($2::text[])`,
    [month, [...branches]]
  );
  return new Map(
    rows.map((r) => [
      r.branch,
      {
        bpuTarget: Number(r.bpu_target),
        offtakeTarget: Number(r.offtake_target),
        sprInternalTarget: Number(r.spr_internal_target),
        sprExternalTarget: Number(r.spr_external_target),
        pmOcTarget: Number(r.pm_oc_target),
        batteryTarget: Number(r.battery_target),
        tyreTarget: Number(r.tyre_target),
      },
    ])
  );
}

/** Every month Jan..upToMonth for one branch, keyed by 'YYYY-MM' — used to
 * build the full-year table plus the annual pacing math (needs every
 * month's target, not just the current one). */
export async function loadCentralMetricTargetsForYear(
  year: string,
  upToMonth: string,
  branch: string
): Promise<Map<string, CentralMetricTargets>> {
  const { rows } = await pool.query<{
    month: string;
    branch: string;
    bpu_target: string;
    offtake_target: string;
    spr_internal_target: string;
    spr_external_target: string;
    pm_oc_target: string;
    battery_target: string;
    tyre_target: string;
  }>(
    `select month, branch, bpu_target, offtake_target, spr_internal_target, spr_external_target, pm_oc_target, battery_target, tyre_target
       from central_metric_targets where branch = $1 and month like $2 order by month`,
    [branch, `${year}-%`]
  );
  return new Map(
    rows
      .filter((r) => r.month <= upToMonth)
      .map((r) => [
        r.month,
        {
          bpuTarget: Number(r.bpu_target),
          offtakeTarget: Number(r.offtake_target),
          sprInternalTarget: Number(r.spr_internal_target),
          sprExternalTarget: Number(r.spr_external_target),
          pmOcTarget: Number(r.pm_oc_target),
          batteryTarget: Number(r.battery_target),
          tyreTarget: Number(r.tyre_target),
        },
      ])
  );
}

/** Upserts one branch's targets for the month — same one-branch-at-a-time
 * contract as region_revenue_targets' save function. */
export async function saveCentralMetricTargets(month: string, branch: string, targets: CentralMetricTargets, setBy: string): Promise<void> {
  await pool.query(
    `insert into central_metric_targets
       (month, branch, bpu_target, offtake_target, spr_internal_target, spr_external_target, pm_oc_target, battery_target, tyre_target, set_by, set_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     on conflict (month, branch) do update set
       bpu_target = excluded.bpu_target,
       offtake_target = excluded.offtake_target,
       spr_internal_target = excluded.spr_internal_target,
       spr_external_target = excluded.spr_external_target,
       pm_oc_target = excluded.pm_oc_target,
       battery_target = excluded.battery_target,
       tyre_target = excluded.tyre_target,
       set_by = excluded.set_by,
       set_at = excluded.set_at`,
    [
      month,
      branch,
      targets.bpuTarget,
      targets.offtakeTarget,
      targets.sprInternalTarget,
      targets.sprExternalTarget,
      targets.pmOcTarget,
      targets.batteryTarget,
      targets.tyreTarget,
      setBy,
    ]
  );
}
