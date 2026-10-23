import type { CloseSaAnalyticsRow } from "./store";

/** One SA's totals across a date range (MTD or any custom range) — same
 * "per-day, summed" accumulation as the rest of the dashboard: callers load
 * every day's row for the range and this just adds them up, never trusts a
 * single day's row to already be cumulative. `jobDescCounts`/`jobTypeCounts`/
 * `payTypeCounts` are merged key-by-key across days. */
export type CloseSaPeriodTotals = Omit<CloseSaAnalyticsRow, "date" | "vehicleVins"> & {
  /** Present only when aggregating across branches (e.g. /branches) — the
   * single branch this SA's rows all shared, or more than one entry if the
   * same normalized name turned up at more than one branch (a real risk —
   * two different people can share a name, and this is name-only matching
   * with no SA-code key available outside Cost & Sales). */
  branches: string[];
  /** Union of every day's vehicleVins in the period, deduped — the true
   * distinct-vehicles-this-period count, not a sum of daily counts (which
   * would double-count a vehicle serviced on more than one day). */
  distinctVehicleCount: number;
};

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [k, v] of Object.entries(source)) target[k] = (target[k] ?? 0) + v;
}

/** Rolls up a list of daily rows (any mix of branches/dates/SAs) into one
 * row per close_sa_name. Pass rows already scoped to the period/branch(es)
 * you want totaled — this does no date or branch filtering of its own. */
export function aggregateCloseSaRows(rows: CloseSaAnalyticsRow[]): CloseSaPeriodTotals[] {
  const byName = new Map<string, CloseSaPeriodTotals>();
  const vinSets = new Map<string, Set<string>>();

  for (const r of rows) {
    let acc = byName.get(r.closeSaName);
    if (!acc) {
      acc = {
        closeSaName: r.closeSaName,
        branch: r.branch,
        branches: [],
        roCount: 0,
        distinctVehicleCount: 0, // filled in after the loop, from vinSets — see below
        jobDescCounts: {},
        wheelBalancingCount: 0,
        wheelAlignmentCount: 0,
        brakeSkimmingCount: 0,
        evaporatorCleaningCount: 0,
        vasBillRevenue: 0,
        jobTypeCounts: {},
        payTypeCounts: {},
        amcCount: 0,
        fmscCount: 0,
        emCount: 0,
        em60Count: 0,
        em60OnTimeCount: 0,
        appointmentCount: 0,
        walkinCount: 0,
        bpPotentialCount: 0,
        labourRevenueBefore: 0,
        labourRevenueAfter: 0,
        soldHours: 0,
        overTargetTotal: 0,
        partsRevenue: 0,
        partsMatchedRoCount: 0,
        engineFlushCount: 0,
        injectorCleanerCount: 0,
        syntheticOilLtrs: 0,
        brakeCleaningCount: 0,
        diyCount: 0,
        diyRevenue: 0,
        externalSales: 0,
        tyreCount: 0,
        batteryCount: 0,
        bpFinalInvoiceAmount: 0,
        bpEstimateAmount: 0,
        bpRoCount: 0,
      };
      byName.set(r.closeSaName, acc);
    }
    if (!acc.branches.includes(r.branch)) acc.branches.push(r.branch);

    if (!vinSets.has(r.closeSaName)) vinSets.set(r.closeSaName, new Set());
    const vinSet = vinSets.get(r.closeSaName)!;
    for (const vin of r.vehicleVins) if (vin) vinSet.add(vin);

    acc.roCount += r.roCount;
    mergeCounts(acc.jobDescCounts, r.jobDescCounts);
    acc.wheelBalancingCount += r.wheelBalancingCount;
    acc.wheelAlignmentCount += r.wheelAlignmentCount;
    acc.brakeSkimmingCount += r.brakeSkimmingCount;
    acc.evaporatorCleaningCount += r.evaporatorCleaningCount;
    acc.vasBillRevenue += r.vasBillRevenue;
    mergeCounts(acc.jobTypeCounts, r.jobTypeCounts);
    mergeCounts(acc.payTypeCounts, r.payTypeCounts);
    acc.amcCount += r.amcCount;
    acc.fmscCount += r.fmscCount;
    acc.emCount += r.emCount;
    acc.em60Count += r.em60Count;
    acc.em60OnTimeCount += r.em60OnTimeCount;
    acc.appointmentCount += r.appointmentCount;
    acc.walkinCount += r.walkinCount;
    acc.bpPotentialCount += r.bpPotentialCount;
    acc.labourRevenueBefore += r.labourRevenueBefore;
    acc.labourRevenueAfter += r.labourRevenueAfter;
    acc.soldHours += r.soldHours;
    acc.overTargetTotal += r.overTargetTotal;
    acc.partsRevenue += r.partsRevenue;
    acc.partsMatchedRoCount += r.partsMatchedRoCount;
    acc.engineFlushCount += r.engineFlushCount;
    acc.injectorCleanerCount += r.injectorCleanerCount;
    acc.syntheticOilLtrs += r.syntheticOilLtrs;
    acc.brakeCleaningCount += r.brakeCleaningCount;
    acc.diyCount += r.diyCount;
    acc.diyRevenue += r.diyRevenue;
    acc.externalSales += r.externalSales;
    acc.tyreCount += r.tyreCount;
    acc.batteryCount += r.batteryCount;
    acc.bpFinalInvoiceAmount += r.bpFinalInvoiceAmount;
    acc.bpEstimateAmount += r.bpEstimateAmount;
    acc.bpRoCount += r.bpRoCount;
  }

  for (const acc of byName.values()) {
    acc.distinctVehicleCount = vinSets.get(acc.closeSaName)?.size ?? 0;
  }

  return [...byName.values()].sort((a, b) => b.roCount - a.roCount);
}

/** Of the ROs this SA closed in the period, what share had a matching Part
 * Sale row — the honesty check so "Parts Revenue" is never read as
 * exhaustive. null when the SA closed no ROs at all. */
export function partsMatchCoveragePct(totals: CloseSaPeriodTotals): number | null {
  if (totals.roCount === 0) return null;
  return totals.partsMatchedRoCount / totals.roCount;
}

/** Of this SA's EM60 (Periodic Maintenance, 60-min target) ROs, what share
 * were On-Time Delivery (Job Open → Invoice at or under 60 min). null when
 * the SA had no EM60 ROs in the period at all. */
export function em60OtdPct(totals: CloseSaPeriodTotals): number | null {
  if (totals.em60Count === 0) return null;
  return totals.em60OnTimeCount / totals.em60Count;
}
