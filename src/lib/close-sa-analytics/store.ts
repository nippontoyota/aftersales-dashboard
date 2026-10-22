import type { PoolClient } from "pg";
import { pool } from "../db";
import type { CloseSaDailyMetrics } from "./compute";

/** Replaces one branch/date's whole set of Close SA rows — compute.ts always
 * produces a full recompute for that day, never a partial update, so the
 * simplest correct write is delete-then-insert (same approach
 * raw-upload-rows/store.ts uses for a re-upload). */
export async function saveCloseSaAnalyticsForDate(
  branch: string,
  date: string,
  byCloseSa: Map<string, CloseSaDailyMetrics>,
  client?: PoolClient
): Promise<void> {
  const run = async (qc: Pick<PoolClient, "query">) => {
    await qc.query(`delete from close_sa_analytics_daily where branch = $1 and date = $2`, [branch, date]);
    for (const [closeSaName, m] of byCloseSa) {
      if (!closeSaName) continue;
      await qc.query(
        `insert into close_sa_analytics_daily (
           date, branch, close_sa_name, ro_count, vehicle_vins, job_desc_counts,
           wheel_balancing_count, wheel_alignment_count, brake_skimming_count, evaporator_cleaning_count,
           vas_bill_revenue, job_type_counts, pay_type_counts, amc_count, fmsc_count, em_count,
           appointment_count, walkin_count, bp_potential_count,
           labour_revenue_before, labour_revenue_after, sold_hours, over_target_total,
           parts_revenue, parts_matched_ro_count, engine_flush_count, injector_cleaner_count,
           synthetic_oil_ltrs, brake_cleaning_count, diy_count, diy_revenue, external_sales,
           bp_final_invoice_amount, bp_estimate_amount, bp_ro_count
         ) values (
           $1, $2, $3, $4, $5::jsonb, $6::jsonb,
           $7, $8, $9, $10,
           $11, $12::jsonb, $13::jsonb, $14, $15, $16,
           $17, $18, $19,
           $20, $21, $22, $23,
           $24, $25, $26, $27,
           $28, $29, $30, $31, $32,
           $33, $34, $35
         )`,
        [
          date,
          branch,
          closeSaName,
          m.roCount,
          JSON.stringify(m.vehicleVins),
          JSON.stringify(m.jobDescCounts),
          m.wheelBalancingCount,
          m.wheelAlignmentCount,
          m.brakeSkimmingCount,
          m.evaporatorCleaningCount,
          m.vasBillRevenue,
          JSON.stringify(m.jobTypeCounts),
          JSON.stringify(m.payTypeCounts),
          m.amcCount,
          m.fmscCount,
          m.emCount,
          m.appointmentCount,
          m.walkinCount,
          m.bpPotentialCount,
          m.labourRevenueBefore,
          m.labourRevenueAfter,
          m.soldHours,
          m.overTargetTotal,
          m.partsRevenue,
          m.partsMatchedRoCount,
          m.engineFlushCount,
          m.injectorCleanerCount,
          m.syntheticOilLtrs,
          m.brakeCleaningCount,
          m.diyCount,
          m.diyRevenue,
          m.externalSales,
          m.bpFinalInvoiceAmount,
          m.bpEstimateAmount,
          m.bpRoCount,
        ]
      );
    }
  };

  if (client) {
    await run(client);
    return;
  }
  const ownClient = await pool.connect();
  try {
    await ownClient.query("begin");
    await run(ownClient);
    await ownClient.query("commit");
  } catch (err) {
    await ownClient.query("rollback");
    throw err;
  } finally {
    ownClient.release();
  }
}

export type CloseSaAnalyticsRow = CloseSaDailyMetrics & { closeSaName: string; branch: string; date: string };

function rowFromDb(r: Record<string, unknown>): CloseSaAnalyticsRow {
  return {
    closeSaName: r.close_sa_name as string,
    branch: r.branch as string,
    date: r.date as string,
    roCount: Number(r.ro_count),
    vehicleVins: (r.vehicle_vins as string[]) ?? [],
    jobDescCounts: (r.job_desc_counts as Record<string, number>) ?? {},
    wheelBalancingCount: Number(r.wheel_balancing_count),
    wheelAlignmentCount: Number(r.wheel_alignment_count),
    brakeSkimmingCount: Number(r.brake_skimming_count),
    evaporatorCleaningCount: Number(r.evaporator_cleaning_count),
    vasBillRevenue: Number(r.vas_bill_revenue),
    jobTypeCounts: (r.job_type_counts as Record<string, number>) ?? {},
    payTypeCounts: (r.pay_type_counts as Record<string, number>) ?? {},
    amcCount: Number(r.amc_count),
    fmscCount: Number(r.fmsc_count),
    emCount: Number(r.em_count),
    appointmentCount: Number(r.appointment_count),
    walkinCount: Number(r.walkin_count),
    bpPotentialCount: Number(r.bp_potential_count),
    labourRevenueBefore: Number(r.labour_revenue_before),
    labourRevenueAfter: Number(r.labour_revenue_after),
    soldHours: Number(r.sold_hours),
    overTargetTotal: Number(r.over_target_total),
    partsRevenue: Number(r.parts_revenue),
    partsMatchedRoCount: Number(r.parts_matched_ro_count),
    engineFlushCount: Number(r.engine_flush_count),
    injectorCleanerCount: Number(r.injector_cleaner_count),
    syntheticOilLtrs: Number(r.synthetic_oil_ltrs),
    brakeCleaningCount: Number(r.brake_cleaning_count),
    diyCount: Number(r.diy_count),
    diyRevenue: Number(r.diy_revenue),
    externalSales: Number(r.external_sales),
    bpFinalInvoiceAmount: Number(r.bp_final_invoice_amount),
    bpEstimateAmount: Number(r.bp_estimate_amount),
    bpRoCount: Number(r.bp_ro_count),
  };
}

/** Every Close SA row for one branch across a date range (inclusive) —
 * MTD/period callers sum these themselves (same "per-day, summed"
 * accumulation pattern as the rest of the dashboard), rather than this
 * module pre-aggregating, so a caller can also chart or list day-by-day. */
export async function loadCloseSaAnalyticsForBranch(branch: string, fromDate: string, toDate: string): Promise<CloseSaAnalyticsRow[]> {
  const { rows } = await pool.query(
    `select * from close_sa_analytics_daily where branch = $1 and date >= $2 and date <= $3 order by date, close_sa_name`,
    [branch, fromDate, toDate]
  );
  return rows.map(rowFromDb);
}

/** Same, company-wide — every branch, for /branches (HQ admin). */
export async function loadCloseSaAnalyticsForAllBranches(fromDate: string, toDate: string): Promise<CloseSaAnalyticsRow[]> {
  const { rows } = await pool.query(
    `select * from close_sa_analytics_daily where date >= $1 and date <= $2 order by branch, date, close_sa_name`,
    [fromDate, toDate]
  );
  return rows.map(rowFromDb);
}
