import { pool } from "../db";

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

export async function loadCentralMonthlyActuals(branch: string, month: string): Promise<CentralMetricActuals> {
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
