import { pool } from "../db";
import { TARGET_OVERRIDE_START_DATE } from "../target-overrides";

/** One past month's FINAL achieved figure for all 7 metrics, for one branch
 * — "final" meaning the last BA Tool / Part Sale Report snapshot dated
 * within that month, since both are cumulative-within-month (reset at the
 * start of each new month, growing day by day) exactly like every other
 * MTD figure in this app. For the CURRENT month, callers use the already-
 * loaded BranchReport instead (buildReport's own live MTD fields) rather
 * than this — this is only for months that have already closed. */
export type CentralMetricActuals = {
  bpuAchieved: number | null;
  offtakeAchieved: number | null;
  sprInternalAchieved: number | null;
  sprExternalAchieved: number | null;
  pmOcAchieved: number | null;
  batteryAchieved: number | null;
  tyreAchieved: number | null;
};

function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

function addActuals(a: CentralMetricActuals, b: CentralMetricActuals): CentralMetricActuals {
  return {
    bpuAchieved: sumOrNull([a.bpuAchieved, b.bpuAchieved]),
    offtakeAchieved: sumOrNull([a.offtakeAchieved, b.offtakeAchieved]),
    sprInternalAchieved: sumOrNull([a.sprInternalAchieved, b.sprInternalAchieved]),
    sprExternalAchieved: sumOrNull([a.sprExternalAchieved, b.sprExternalAchieved]),
    pmOcAchieved: sumOrNull([a.pmOcAchieved, b.pmOcAchieved]),
    batteryAchieved: sumOrNull([a.batteryAchieved, b.batteryAchieved]),
    tyreAchieved: sumOrNull([a.tyreAchieved, b.tyreAchieved]),
  };
}

async function loadOneBranchMonthlyActuals(branch: string, month: string): Promise<CentralMetricActuals> {
  const [baToolRow, extRow] = await Promise.all([
    pool.query<{
      pm: string | null;
      bpus: string | null;
      spr_internal: string | null;
      spo_dealer: string | null;
      tyre_actual: string | null;
      battery_actuals: string | null;
    }>(
      `select pm, bpus, spr_internal, spo_dealer, tyre_actual, battery_actuals
         from ba_tool_snapshots
        where branch = $1 and to_char(date, 'YYYY-MM') = $2
        order by date desc limit 1`,
      [branch, month]
    ),
    pool.query<{ ext: string }>(
      `select coalesce(sum(external_sales), 0) as ext
         from part_sale_snapshots
        where branch = $1 and to_char(date, 'YYYY-MM') = $2`,
      [branch, month]
    ),
  ]);

  const r = baToolRow.rows[0];
  return {
    bpuAchieved: r ? Number(r.bpus) : null,
    offtakeAchieved: r ? Number(r.spo_dealer) : null,
    sprInternalAchieved: r ? Number(r.spr_internal) : null,
    sprExternalAchieved: Number(extRow.rows[0].ext),
    pmOcAchieved: r ? Number(r.pm) : null,
    batteryAchieved: r ? Number(r.battery_actuals) : null,
    tyreAchieved: r ? Number(r.tyre_actual) : null,
  };
}

/** CO01B/CO01E fold-in (2026-09-26, at the RM's request) — before
 * TARGET_OVERRIDE_START_DATE, CO01B's TKM target already lumps in CO01E's
 * whole share (see target-overrides.ts), but its achieved figures never did.
 * Folding CO01E's achieved into CO01B's for those months keeps the two
 * sides of the comparison scoped the same way, for all 7 metrics. */
export async function loadCentralMonthlyActuals(branch: string, month: string): Promise<CentralMetricActuals> {
  const own = await loadOneBranchMonthlyActuals(branch, month);
  if (branch !== "CO01B" || month >= TARGET_OVERRIDE_START_DATE.slice(0, 7)) return own;
  const co01e = await loadOneBranchMonthlyActuals("CO01E", month);
  return addActuals(own, co01e);
}
