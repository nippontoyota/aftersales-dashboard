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
import { isDatePublished } from "./publish-store";

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
  /** Null when no BA Tool report exists for `date` yet — a date without an
   * upload is pickable now (branches are backfilling from January onward),
   * so this is expected, not an error. */
  report: Report | null;
  group: { hero: HeroSummary; kpis: KpiSummary } | null;
  regions: VpRegionRollup[];
  isPublished: boolean;
  uploadedBranchCount: number;
  totalBranchCount: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function loadVpData(requestedDate?: string): Promise<VpData | null> {
  const dates = await listSnapshotDates();
  if (dates.length === 0) return null;

  const date = requestedDate && DATE_RE.test(requestedDate) ? requestedDate : dates.at(-1)!;
  const [report, published] = await Promise.all([buildReport(date), isDatePublished(date)]);

  if (!report) return { date, dates, report: null, group: null, regions: [], isPublished: published, uploadedBranchCount: 0, totalBranchCount: 18 };

  const regions: VpRegionRollup[] = (Object.keys(REGIONS) as RegionName[]).map((region) => {
    const branches = filterBranchesByRegion(report.branches, region);
    return { region, branches, hero: computeHeroSummary(branches), kpis: computeKpiSummary(branches) };
  });

  const hasCo01c = report.branches.some((b) => b.branch === "CO01C");

  return {
    date,
    dates,
    report,
    group: { hero: computeHeroSummary(report.branches), kpis: computeKpiSummary(report.branches) },
    regions,
    isPublished: published,
    uploadedBranchCount: report.branches.length,
    totalBranchCount: 18 + (hasCo01c ? 1 : 0),
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
