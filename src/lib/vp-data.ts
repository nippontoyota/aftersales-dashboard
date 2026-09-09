import {
  computeHeroSummary,
  computeKpiSummary,
  filterBranchesByRegion,
  type HeroSummary,
  type KpiSummary,
} from "./aggregate";
import { REGIONS, regionForBranch, type RegionName } from "./regions";
import { buildReport, type BranchReport, type Report } from "./report";
import { listSnapshotDates } from "./snapshot-store";

/**
 * The data foundation for the VP Service view (/vp). Deliberately separate
 * from dashboard-data.ts — the VP is company-wide always, never gated by
 * publish status or scoped to a region/branch, so none of that machinery
 * applies. Just: pick a date, build the report, roll it up by region.
 */

export type VpRegionRollup = {
  region: RegionName;
  branches: BranchReport[];
  hero: HeroSummary;
  kpis: KpiSummary;
};

export type VpData = {
  date: string;
  dates: string[];
  report: Report;
  group: { hero: HeroSummary; kpis: KpiSummary };
  regions: VpRegionRollup[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function loadVpData(requestedDate?: string): Promise<VpData | null> {
  const dates = await listSnapshotDates();
  if (dates.length === 0) return null;

  const date = requestedDate && DATE_RE.test(requestedDate) && dates.includes(requestedDate) ? requestedDate : dates.at(-1)!;
  const report = await buildReport(date);
  if (!report) return null;

  const regions: VpRegionRollup[] = (Object.keys(REGIONS) as RegionName[]).map((region) => {
    const branches = filterBranchesByRegion(report.branches, region);
    return { region, branches, hero: computeHeroSummary(branches), kpis: computeKpiSummary(branches) };
  });

  return {
    date,
    dates,
    report,
    group: { hero: computeHeroSummary(report.branches), kpis: computeKpiSummary(report.branches) },
    regions,
  };
}

/** Branch codes present in the report, grouped by region and ordered like
 * REGIONS — for the /vp/branches picker. */
export function branchOptionsByRegion(report: Report): { region: RegionName; branches: string[] }[] {
  return (Object.keys(REGIONS) as RegionName[]).map((region) => ({
    region,
    branches: report.branches.map((b) => b.branch).filter((code) => regionForBranch(code) === region),
  }));
}
