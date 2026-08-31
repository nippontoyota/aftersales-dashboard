import type { BaToolBranchRow } from "./ba-tool/parse";
import type { Snapshot } from "./snapshot-store";
import type { ServiceInfoSnapshot } from "./service-info/store";
import { REGIONS, type RegionName } from "./regions";

/**
 * Day-by-day trend series for one BA Tool actual/target field pair, summed
 * (or averaged, for percentage-shaped fields like T-Gloss penetration —
 * summing a % across branches is meaningless, same rule as aggregate.ts's
 * avgField) across whichever branches match the region filter. Built from
 * the same monthSnapshots already loaded for MTD accumulation elsewhere
 * (Tyre/Battery, VAS) — no extra DB round trip. Only fields that exist
 * directly on the BA Tool row work here — real cumulative/daily values
 * already in the file, never a derived/estimated figure.
 */
export type TrendPoint = { date: string; actual: number | null; target: number | null };

function num(value: number | string | null | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function branchesInRegion(region: RegionName | "All"): readonly string[] | null {
  if (region === "All") return null;
  return REGIONS[region];
}

export function computeTrendSeries(
  monthSnapshots: Snapshot[],
  region: RegionName | "All",
  actualKey: keyof BaToolBranchRow,
  /** Omit for a metric with no real confirmed target (e.g. GUS RO) — every point's `target` comes back null rather than a misleading stand-in. */
  targetKey?: keyof BaToolBranchRow,
  /** "avg" for percentage-shaped fields (T-Gloss penetration); "sum" (default) for everything else. */
  aggregate: "sum" | "avg" = "sum",
  /** Locks the series to exactly one branch, ignoring `region` — for a
   * branch admin's own dashboard, where "region" doesn't apply. */
  branchLock?: string
): TrendPoint[] {
  const allowedBranches = branchLock ? [branchLock] : branchesInRegion(region);

  return [...monthSnapshots]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((snapshot) => {
      const actuals: number[] = [];
      const targets: number[] = [];

      for (const row of snapshot.branches) {
        if (allowedBranches && !allowedBranches.includes(row.branch)) continue;
        const actual = num(row[actualKey] as number | string | null);
        if (actual !== null) actuals.push(actual);
        if (targetKey) {
          const target = num(row[targetKey] as number | string | null);
          if (target !== null) targets.push(target);
        }
      }

      const reduce = (values: number[]) => {
        if (values.length === 0) return null;
        const total = values.reduce((a, b) => a + b, 0);
        return aggregate === "avg" ? total / values.length : total;
      };

      return { date: snapshot.date, actual: reduce(actuals), target: targetKey ? reduce(targets) : null };
    });
}

// Same fixed constants as VAS_BILL_TARGET_RO_SHARE/PER_RO in report.ts —
// duplicated rather than imported to avoid a lib/lib circular dependency,
// same convention as FIXED_TGLOSS_TARGET being duplicated between
// aggregate.ts and report.ts.
const VAS_BILL_TARGET_RO_SHARE = 0.38;
const VAS_BILL_TARGET_PER_RO = 3000;

/**
 * Day-by-day VAS Bill trend — unlike computeTrendSeries above, VAS has no
 * single raw BA Tool field for either side: Target is derived per day from
 * that day's GUS RO MTD (a real BA Tool field), and Actual is the
 * cumulative sum of Service Info Report VAS revenue up to and including
 * that day (a wholly different snapshot source, keyed per branch per date
 * rather than one merged document per day like BA Tool). Built from the
 * same monthSnapshots/serviceInfoMonthSnapshots already loaded elsewhere —
 * no extra DB round trip.
 */
export function computeVasTrendSeries(
  baToolMonthSnapshots: Snapshot[],
  serviceInfoMonthSnapshots: ServiceInfoSnapshot[],
  region: RegionName | "All",
  branchLock?: string
): TrendPoint[] {
  const allowedBranches = branchLock ? [branchLock] : branchesInRegion(region);
  const inScope = (branch: string) => !allowedBranches || allowedBranches.includes(branch);

  return [...baToolMonthSnapshots]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((snapshot) => {
      let target = 0;
      let targetFound = false;
      for (const row of snapshot.branches) {
        if (!inScope(row.branch)) continue;
        const gusRoMtd = num(row.gus as number | string | null);
        if (gusRoMtd === null) continue;
        target += gusRoMtd * VAS_BILL_TARGET_RO_SHARE * VAS_BILL_TARGET_PER_RO;
        targetFound = true;
      }

      let actual = 0;
      let actualFound = false;
      for (const s of serviceInfoMonthSnapshots) {
        if (!inScope(s.branch) || s.date > snapshot.date) continue;
        actual += s.counts.vasRevenue;
        actualFound = true;
      }

      return { date: snapshot.date, actual: actualFound ? actual : null, target: targetFound ? target : null };
    });
}
