import type { PoolClient } from "pg";
import { pool } from "../db";
import type { CloseSaDailyMetrics } from "./compute";

/** Replaces one branch/date's whole set of Close SA rows — compute.ts always
 * produces a full recompute for that day, never a partial update. Upserts
 * each close_sa_name row (on conflict (date, branch, close_sa_name) do
 * update) rather than delete-then-insert: this is called from `after()` in
 * six upload routes, so two uploads touching the same branch/date can now
 * recompute concurrently (confirmed 2026-11-19 — a plain delete-then-insert
 * let two concurrent recomputes race to insert the same primary key, one
 * failing with a duplicate-key error and silently losing that recompute).
 * An upsert just serializes on Postgres's own row lock instead. Still
 * deletes first, but only the close_sa_names that no longer appear in this
 * recompute (an SA who had rows yesterday but none today) — those have no
 * row to upsert over. */
export async function saveCloseSaAnalyticsForDate(
  branch: string,
  date: string,
  byCloseSa: Map<string, CloseSaDailyMetrics>,
  client?: PoolClient
): Promise<void> {
  const run = async (qc: Pick<PoolClient, "query">) => {
    const closeSaNames = [...byCloseSa.keys()].filter(Boolean);
    await qc.query(
      `delete from close_sa_analytics_daily where branch = $1 and date = $2 and not (close_sa_name = any($3::text[]))`,
      [branch, date, closeSaNames]
    );
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
           tyre_count, battery_count,
           bp_final_invoice_amount, bp_estimate_amount, bp_ro_count,
           em60_count, em60_on_time_count,
           mech_care_count, brake_cleaning_labour_count, tgloss_pitched_ro_count, pm_ro_count,
           same_day_delivery_count, bp_labour_revenue, bp_parts_revenue, bp_tgloss_revenue,
           bp_repair_type_counts, bp_work_order_count, bp_otd_eligible_count, bp_otd_on_time_count,
           gs_otd_eligible_count, gs_otd_on_time_count
         ) values (
           $1, $2, $3, $4, $5::jsonb, $6::jsonb,
           $7, $8, $9, $10,
           $11, $12::jsonb, $13::jsonb, $14, $15, $16,
           $17, $18, $19,
           $20, $21, $22, $23,
           $24, $25, $26, $27,
           $28, $29, $30, $31, $32,
           $33, $34,
           $35, $36, $37,
           $38, $39,
           $40, $41, $42, $43,
           $44, $45, $46, $47,
           $48::jsonb, $49, $50, $51,
           $52, $53
         )
         on conflict (date, branch, close_sa_name) do update set
           ro_count = excluded.ro_count,
           vehicle_vins = excluded.vehicle_vins,
           job_desc_counts = excluded.job_desc_counts,
           wheel_balancing_count = excluded.wheel_balancing_count,
           wheel_alignment_count = excluded.wheel_alignment_count,
           brake_skimming_count = excluded.brake_skimming_count,
           evaporator_cleaning_count = excluded.evaporator_cleaning_count,
           vas_bill_revenue = excluded.vas_bill_revenue,
           job_type_counts = excluded.job_type_counts,
           pay_type_counts = excluded.pay_type_counts,
           amc_count = excluded.amc_count,
           fmsc_count = excluded.fmsc_count,
           em_count = excluded.em_count,
           appointment_count = excluded.appointment_count,
           walkin_count = excluded.walkin_count,
           bp_potential_count = excluded.bp_potential_count,
           labour_revenue_before = excluded.labour_revenue_before,
           labour_revenue_after = excluded.labour_revenue_after,
           sold_hours = excluded.sold_hours,
           over_target_total = excluded.over_target_total,
           parts_revenue = excluded.parts_revenue,
           parts_matched_ro_count = excluded.parts_matched_ro_count,
           engine_flush_count = excluded.engine_flush_count,
           injector_cleaner_count = excluded.injector_cleaner_count,
           synthetic_oil_ltrs = excluded.synthetic_oil_ltrs,
           brake_cleaning_count = excluded.brake_cleaning_count,
           diy_count = excluded.diy_count,
           diy_revenue = excluded.diy_revenue,
           external_sales = excluded.external_sales,
           tyre_count = excluded.tyre_count,
           battery_count = excluded.battery_count,
           bp_final_invoice_amount = excluded.bp_final_invoice_amount,
           bp_estimate_amount = excluded.bp_estimate_amount,
           bp_ro_count = excluded.bp_ro_count,
           em60_count = excluded.em60_count,
           em60_on_time_count = excluded.em60_on_time_count,
           mech_care_count = excluded.mech_care_count,
           brake_cleaning_labour_count = excluded.brake_cleaning_labour_count,
           tgloss_pitched_ro_count = excluded.tgloss_pitched_ro_count,
           pm_ro_count = excluded.pm_ro_count,
           same_day_delivery_count = excluded.same_day_delivery_count,
           bp_labour_revenue = excluded.bp_labour_revenue,
           bp_parts_revenue = excluded.bp_parts_revenue,
           bp_tgloss_revenue = excluded.bp_tgloss_revenue,
           bp_repair_type_counts = excluded.bp_repair_type_counts,
           bp_work_order_count = excluded.bp_work_order_count,
           bp_otd_eligible_count = excluded.bp_otd_eligible_count,
           bp_otd_on_time_count = excluded.bp_otd_on_time_count,
           gs_otd_eligible_count = excluded.gs_otd_eligible_count,
           gs_otd_on_time_count = excluded.gs_otd_on_time_count,
           computed_at = now()`,
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
          m.tyreCount,
          m.batteryCount,
          m.bpFinalInvoiceAmount,
          m.bpEstimateAmount,
          m.bpRoCount,
          m.em60Count,
          m.em60OnTimeCount,
          m.mechCareCount,
          m.brakeCleaningLabourCount,
          m.tglossPitchedRoCount,
          m.pmRoCount,
          m.sameDayDeliveryCount,
          m.bpLabourRevenue,
          m.bpPartsRevenue,
          m.bpTglossRevenue,
          JSON.stringify(m.bpRepairTypeCounts),
          m.bpWorkOrderCount,
          m.bpOtdEligibleCount,
          m.bpOtdOnTimeCount,
          m.otdEligibleCount,
          m.otdOnTimeCount,
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
    em60Count: Number(r.em60_count),
    em60OnTimeCount: Number(r.em60_on_time_count),
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
    tyreCount: Number(r.tyre_count),
    batteryCount: Number(r.battery_count),
    mechCareCount: Number(r.mech_care_count),
    brakeCleaningLabourCount: Number(r.brake_cleaning_labour_count),
    tglossPitchedRoCount: Number(r.tgloss_pitched_ro_count),
    pmRoCount: Number(r.pm_ro_count),
    sameDayDeliveryCount: Number(r.same_day_delivery_count),
    bpLabourRevenue: Number(r.bp_labour_revenue),
    bpPartsRevenue: Number(r.bp_parts_revenue),
    bpTglossRevenue: Number(r.bp_tgloss_revenue),
    bpRepairTypeCounts: (r.bp_repair_type_counts as Record<string, number>) ?? {},
    bpFinalInvoiceAmount: Number(r.bp_final_invoice_amount),
    bpEstimateAmount: Number(r.bp_estimate_amount),
    bpRoCount: Number(r.bp_ro_count),
    bpWorkOrderCount: Number(r.bp_work_order_count),
    bpOtdEligibleCount: Number(r.bp_otd_eligible_count),
    bpOtdOnTimeCount: Number(r.bp_otd_on_time_count),
    otdEligibleCount: Number(r.gs_otd_eligible_count),
    otdOnTimeCount: Number(r.gs_otd_on_time_count),
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
