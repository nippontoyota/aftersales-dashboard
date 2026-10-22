import { pool } from "../db";
import type { CentralMetricKey } from "./metrics";

/** BA Tool's own target fields for one branch on one exact date, keyed the
 * same way as CentralMetricTargets — bpu/offtake/sprInternal/pmOc/battery/
 * tyre all have their own column in ba_tool_snapshots; sprExternal has none,
 * so it's always null. Used only to pre-fill South/North's Set Targets form
 * (2026-10-20) — safe there because target-overrides.ts's CO01B/CO01E split
 * never applies outside Central, so the raw column already matches the
 * resolved value. Central's own Set Targets page instead reads off the
 * built BranchReport via view-data.ts's baToolTargetFromReport, which does
 * go through that split — see loadCentralMetricTargetsView's doc comment
 * for the read-only TKM Targets page's equivalent fallback. */
export type BaToolMetricTargets = Record<CentralMetricKey, number | null>;

function numOrNull(v: string | null | undefined): number | null {
  return v === null || v === undefined ? null : Number(v);
}

export async function loadBaToolMetricTargets(branch: string, date: string): Promise<BaToolMetricTargets> {
  const { rows } = await pool.query<{
    bpus_target: string | null;
    spo_dealer_target: string | null;
    spr_internal_target: string | null;
    pm_target: string | null;
    battery_target: string | null;
    tyre_target: string | null;
  }>(
    `select bpus_target, spo_dealer_target, spr_internal_target, pm_target, battery_target, tyre_target
       from ba_tool_snapshots where branch = $1 and date = $2`,
    [branch, date]
  );
  const r = rows[0];
  return {
    bpu: numOrNull(r?.bpus_target),
    offtake: numOrNull(r?.spo_dealer_target),
    sprInternal: numOrNull(r?.spr_internal_target),
    sprExternal: null,
    pmOc: numOrNull(r?.pm_target),
    battery: numOrNull(r?.battery_target),
    tyre: numOrNull(r?.tyre_target),
  };
}
