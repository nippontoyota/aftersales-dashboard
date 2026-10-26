import { isAccessoriesStaff } from "../accessories-staff";
import { PDI_JOB_DESC } from "./compute";
import type { CloseSaAnalyticsRow } from "./store";

/** One SA's totals across a date range (MTD or any custom range) — same
 * "per-day, summed" accumulation as the rest of the dashboard: callers load
 * every day's row for the range and this just adds them up, never trusts a
 * single day's row to already be cumulative. `jobDescCounts`/`jobTypeCounts`/
 * `payTypeCounts` are merged key-by-key across days. */
export type CloseSaPeriodTotals = Omit<CloseSaAnalyticsRow, "date" | "vehicleVins"> & {
  /** Always exactly one branch — the one this row's SA is scoped to.
   * Aggregation keys on (branch, closeSaName), never name alone: two
   * different people can share a name at different branches (confirmed
   * 2026-10-24, "Akhil K R" at both CO01A and CO01B), and this is name-only
   * matching with no SA-code key available outside Cost & Sales, so branch
   * is the only thing that can tell them apart. Kept as an array (rather
   * than a single string) for backwards compatibility with the UI code that
   * reads it. */
  branches: string[];
  /** Union of every day's vehicleVins in the period, deduped — the true
   * distinct-vehicles-this-period count, not a sum of daily counts (which
   * would double-count a vehicle serviced on more than one day). */
  distinctVehicleCount: number;
  /** Same Car Same Work Repeat flags where this SA closed the repeat visit —
   * NOT part of the per-day snapshot (see repeat-jobs.ts for why: it's a
   * cross-date comparison, not additive). Defaults to 0; the caller merges
   * real counts in via mergeRepeatJobCounts after loading them separately. */
  repeatJobCount: number;
};

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [k, v] of Object.entries(source)) target[k] = (target[k] ?? 0) + v;
}

/** Rolls up a list of daily rows (any mix of branches/dates/SAs) into one
 * row per (branch, close_sa_name) — never per name alone, since the same
 * name can belong to two different people at two different branches. Pass
 * rows already scoped to the period/branch(es) you want totaled — this does
 * no date or branch filtering of its own. */
export function aggregateCloseSaRows(rows: CloseSaAnalyticsRow[]): CloseSaPeriodTotals[] {
  const byKey = new Map<string, CloseSaPeriodTotals>();
  const vinSets = new Map<string, Set<string>>();

  for (const r of rows) {
    const key = `${r.branch}|${r.closeSaName}`;
    let acc = byKey.get(key);
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
        mechCareCount: 0,
        brakeCleaningLabourCount: 0,
        tglossPitchedRoCount: 0,
        pmRoCount: 0,
        sameDayDeliveryCount: 0,
        bpLabourRevenue: 0,
        bpPartsRevenue: 0,
        bpTglossRevenue: 0,
        bpRepairTypeCounts: {},
        bpFinalInvoiceAmount: 0,
        bpEstimateAmount: 0,
        bpRoCount: 0,
        bpWorkOrderCount: 0,
        bpOtdEligibleCount: 0,
        bpOtdOnTimeCount: 0,
        repeatJobCount: 0,
      };
      byKey.set(key, acc);
    }
    if (!acc.branches.includes(r.branch)) acc.branches.push(r.branch);

    if (!vinSets.has(key)) vinSets.set(key, new Set());
    const vinSet = vinSets.get(key)!;
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
    acc.mechCareCount += r.mechCareCount;
    acc.brakeCleaningLabourCount += r.brakeCleaningLabourCount;
    acc.tglossPitchedRoCount += r.tglossPitchedRoCount;
    acc.pmRoCount += r.pmRoCount;
    acc.sameDayDeliveryCount += r.sameDayDeliveryCount;
    acc.bpLabourRevenue += r.bpLabourRevenue;
    acc.bpPartsRevenue += r.bpPartsRevenue;
    acc.bpTglossRevenue += r.bpTglossRevenue;
    mergeCounts(acc.bpRepairTypeCounts, r.bpRepairTypeCounts);
    acc.bpFinalInvoiceAmount += r.bpFinalInvoiceAmount;
    acc.bpEstimateAmount += r.bpEstimateAmount;
    acc.bpRoCount += r.bpRoCount;
    acc.bpWorkOrderCount += r.bpWorkOrderCount;
    acc.bpOtdEligibleCount += r.bpOtdEligibleCount;
    acc.bpOtdOnTimeCount += r.bpOtdOnTimeCount;
  }

  for (const [key, acc] of byKey) {
    acc.distinctVehicleCount = vinSets.get(key)?.size ?? 0;
  }

  return [...byKey.values()].sort((a, b) => b.roCount - a.roCount);
}

/** Of this SA's EM60 (Periodic Maintenance, 60-min target) ROs, what share
 * were On-Time Delivery (Job Open → Invoice at or under 60 min). null when
 * the SA had no EM60 ROs in the period at all. */
export function em60OtdPct(totals: CloseSaPeriodTotals): number | null {
  if (totals.em60Count === 0) return null;
  return totals.em60OnTimeCount / totals.em60Count;
}

/** Of every Periodic Maintenance RO this SA closed, what share were flagged
 * EM (any tier, 60/90/120) — "EM to PM percentage". null when no PM ROs. */
export function emToPmPct(totals: CloseSaPeriodTotals): number | null {
  if (totals.pmRoCount === 0) return null;
  return totals.emCount / totals.pmRoCount;
}

/** TGLOSS pitch rate — "pitched" means sold (confirmed with the user: we
 * can only measure what was billed, never an offer that was declined). */
export function tglossPitchRatePct(totals: CloseSaPeriodTotals): number | null {
  if (totals.roCount === 0) return null;
  return totals.tglossPitchedRoCount / totals.roCount;
}

/** TGLOSS revenue ÷ ROs that actually had a TGLOSS job — a tighter ratio
 * than the branch-wide VAS Gentani (which divides by every GUS RO, not
 * just the ones with TGLOSS on them). */
export function tglossGentaniVsPitched(totals: CloseSaPeriodTotals): number | null {
  if (totals.tglossPitchedRoCount === 0) return null;
  return totals.vasBillRevenue / totals.tglossPitchedRoCount;
}

/** Job Open Date = Invoice Date, any RO (not just EM60). */
export function sameDayDeliveryPct(totals: CloseSaPeriodTotals): number | null {
  if (totals.roCount === 0) return null;
  return totals.sameDayDeliveryCount / totals.roCount;
}

export function bpPartsGentani(totals: CloseSaPeriodTotals): number | null {
  if (totals.bpRoCount === 0) return null;
  return totals.bpPartsRevenue / totals.bpRoCount;
}

export function bpLabourGentani(totals: CloseSaPeriodTotals): number | null {
  if (totals.bpRoCount === 0) return null;
  return totals.bpLabourRevenue / totals.bpRoCount;
}

export function bpTglossGentani(totals: CloseSaPeriodTotals): number | null {
  if (totals.bpRoCount === 0) return null;
  return totals.bpTglossRevenue / totals.bpRoCount;
}

/** Unique Work Order (workOrdNo) ÷ unique RO — "SMB Utilization %", null
 * when the SA has no BP ROs at all (not every BP RO gets a Work Order, so
 * this is usually under 100%). */
export function bpSmbUtilizationPct(totals: CloseSaPeriodTotals): number | null {
  if (totals.bpRoCount === 0) return null;
  return totals.bpWorkOrderCount / totals.bpRoCount;
}

/** Handover (NINETH_SMS_SEND_DT) landing in [Promise − 24h, Promise] ÷ ROs
 * where both that and Promise Delivery Date/Time parsed — null when none
 * did (real coverage is ~87%, not every RO has both fields on file). */
export function bpOtdPct(totals: CloseSaPeriodTotals): number | null {
  if (totals.bpOtdEligibleCount === 0) return null;
  return totals.bpOtdOnTimeCount / totals.bpOtdEligibleCount;
}

export type SaCategory = "GS" | "BP" | "Accessories" | "PDI";

/** Precedence, confirmed with the user's own framing (2026-10-23): an
 * explicit Accessories-roster match (an HR/role designation, same one
 * ssrv089/service-info already use to exclude these staff elsewhere) wins
 * over anything inferred from behavior. Then BP, if a majority of this SA's
 * ROs are Body & Paint. Then PDI, if a majority of their ROs are pure
 * Pre-Delivery Inspection (confirmed against one real SA: 24/24 ROs, 100%
 * PDI). Everything else is GS, the default. The 50%/80% thresholds are a
 * judgment call, not confirmed with the user — easy to adjust once real
 * category counts are visible. */
export function classifySaCategory(totals: CloseSaPeriodTotals, accessoriesStaffNames: string[]): SaCategory {
  if (isAccessoriesStaff(accessoriesStaffNames, totals.closeSaName)) return "Accessories";
  if (totals.roCount > 0 && totals.bpRoCount / totals.roCount >= 0.5) return "BP";
  const pdiCount = totals.jobDescCounts[PDI_JOB_DESC] ?? 0;
  if (totals.roCount > 0 && pdiCount / totals.roCount >= 0.8) return "PDI";
  return "GS";
}

/** Splits already-aggregated totals into the 4 SA categories, in display
 * order (GS first, matching the GS/BP/Accessories/PDI ask). Mutates
 * nothing — classifySaCategory is pure, this just buckets. */
export function groupByCategory(totals: CloseSaPeriodTotals[], accessoriesStaffNames: string[]): Record<SaCategory, CloseSaPeriodTotals[]> {
  const groups: Record<SaCategory, CloseSaPeriodTotals[]> = { GS: [], BP: [], Accessories: [], PDI: [] };
  for (const t of totals) groups[classifySaCategory(t, accessoriesStaffNames)].push(t);
  return groups;
}

/** Fills in repeatJobCount (0 by default — see the type's own doc comment)
 * from a separately-loaded repeat-jobs.ts result. `counts` is keyed by
 * repeatJobCountsBySa's `${branch}|${closeSaName}` composite — never by name
 * alone, for the same same-name-different-branch reason as the aggregation
 * above. Mutates `totals` in place. */
export function mergeRepeatJobCounts(totals: CloseSaPeriodTotals[], counts: Map<string, number>): void {
  for (const t of totals) t.repeatJobCount = counts.get(`${t.branches[0]}|${t.closeSaName}`) ?? 0;
}
