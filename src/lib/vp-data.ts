import {
  achievementRatio,
  computeHeroSummary,
  computeKpiSummary,
  filterBranchesByRegion,
  type HeroSummary,
  type KpiSummary,
} from "./aggregate";
import { aggregateIncentiveSlabTargets } from "./incentive-slabs/aggregate";
import { loadIncentiveSlabTargets, type IncentiveSlabTargets } from "./incentive-slabs/store";
import { REGIONS, regionForBranch, type RegionName } from "./regions";
import { buildReport, isBodyPaintOnly, type BranchReport, type Report } from "./report";
import { listSnapshotDates } from "./snapshot-store";
import { isDatePublished } from "./publish-store";
import { countScom205BranchesForDate } from "./scom205/store";

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

/**
 * One column of the Executive Overview's revenue-stream grid — Group or one
 * region, never a single branch (the VP's own view is deliberately never
 * scoped that granular; /vp/branches exists for that). Built from the same
 * HeroSummary/KpiSummary rollups as the rest of the dashboard, plus three
 * things those don't carry: the GUS per-car split, the BPU revenue split
 * between Body & Paint-only branches and everyone else's own BPU line (the
 * VP's own request — see [[project_vp_service_view]]), and this scope's
 * aggregated incentive slab targets.
 */
export type VpScopeMetrics = {
  label: string;
  /** null for the Group column. */
  region: RegionName | null;
  totalRevenueStreamMtd: number | null;
  gusPartsMtd: number | null;
  gusLabourMtd: number | null;
  gusPartsPerCar: number | null;
  gusLabourPerCar: number | null;
  gusRoMtd: number | null;
  bpuRevenueBodyPaintOnlyMtd: number | null;
  bpuRevenueOtherMtd: number | null;
  bpuRoMtd: number | null;
  tglossMtd: number | null;
  tglossTarget: number | null;
  tglossPct: number | null;
  externalSalesMtd: number | null;
  scrapAndUsedOilMtd: number | null;
  /** Undefined when none of this scope's branches have a slab target loaded this month. */
  incentiveSlabs: IncentiveSlabTargets | undefined;
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
  /** [Group, Central, South, North] — the Executive Overview grid's columns, in display order. */
  scopes: VpScopeMetrics[];
  isPublished: boolean;
  uploadedBranchCount: number;
  totalBranchCount: number;
};

function perCar(amount: number | null, ro: number | null): number | null {
  if (amount === null || ro === null || ro === 0) return null;
  return amount / ro;
}

/** Sums BPU Parts + BPU Labour across branches on one side of the Body &
 * Paint-only split. Mirrors sumField's null convention (aggregate.ts): null
 * only if not a single branch in this half contributed a number, 0/summed
 * otherwise. */
function sumBpuRevenue(branches: BranchReport[], bodyPaintOnly: boolean): number | null {
  let total = 0;
  let found = false;
  for (const b of branches) {
    if (isBodyPaintOnly(b.branch) !== bodyPaintOnly) continue;
    if (b.bpuPartsMtd !== null) {
      total += b.bpuPartsMtd;
      found = true;
    }
    if (b.bpuLabourMtd !== null) {
      total += b.bpuLabourMtd;
      found = true;
    }
  }
  return found ? total : null;
}

function buildScopeMetrics(
  label: string,
  region: RegionName | null,
  branches: BranchReport[],
  incentiveSlabTargets: Record<string, IncentiveSlabTargets>
): VpScopeMetrics {
  const hero = computeHeroSummary(branches);
  const kpis = computeKpiSummary(branches);
  return {
    label,
    region,
    totalRevenueStreamMtd: hero.totalRevenueStreamMtd,
    gusPartsMtd: hero.gusPartsMtd,
    gusLabourMtd: hero.gusLabourMtd,
    gusPartsPerCar: perCar(hero.gusPartsMtd, hero.gusRoMtd),
    gusLabourPerCar: perCar(hero.gusLabourMtd, hero.gusRoMtd),
    gusRoMtd: hero.gusRoMtd,
    bpuRevenueBodyPaintOnlyMtd: sumBpuRevenue(branches, true),
    bpuRevenueOtherMtd: sumBpuRevenue(branches, false),
    bpuRoMtd: hero.bpuRoMtd,
    tglossMtd: kpis.vasAchievementForTheMonth,
    tglossTarget: kpis.vasBillTarget,
    tglossPct: achievementRatio(kpis.vasAchievementForTheMonth, kpis.vasBillTarget),
    externalSalesMtd: hero.externalSalesMtd,
    scrapAndUsedOilMtd: hero.scrapRevenueMtd !== null || hero.usedOilRevenueMtd !== null
      ? (hero.scrapRevenueMtd ?? 0) + (hero.usedOilRevenueMtd ?? 0)
      : null,
    incentiveSlabs: aggregateIncentiveSlabTargets(
      incentiveSlabTargets,
      branches.map((b) => b.branch)
    ),
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function loadVpData(requestedDate?: string): Promise<VpData | null> {
  const dates = await listSnapshotDates();
  if (dates.length === 0) return null;

  const date = requestedDate && DATE_RE.test(requestedDate) ? requestedDate : dates.at(-1)!;
  const [report, published, scom205Count, incentiveSlabTargetsMap] = await Promise.all([
    buildReport(date),
    isDatePublished(date),
    countScom205BranchesForDate(date),
    loadIncentiveSlabTargets(date.slice(0, 7)),
  ]);
  const incentiveSlabTargets = Object.fromEntries(incentiveSlabTargetsMap);

  if (!report) return { date, dates, report: null, group: null, regions: [], scopes: [], isPublished: published, uploadedBranchCount: 0, totalBranchCount: 18 };

  const regions: VpRegionRollup[] = (Object.keys(REGIONS) as RegionName[]).map((region) => {
    const branches = filterBranchesByRegion(report.branches, region);
    return { region, branches, hero: computeHeroSummary(branches), kpis: computeKpiSummary(branches) };
  });

  const scopes: VpScopeMetrics[] = [
    buildScopeMetrics("Group", null, report.branches, incentiveSlabTargets),
    ...(Object.keys(REGIONS) as RegionName[]).map((region) =>
      buildScopeMetrics(region, region, filterBranchesByRegion(report.branches, region), incentiveSlabTargets)
    ),
  ];

  const hasCo01c = report.branches.some((b) => b.branch === "CO01C");

  return {
    date,
    dates,
    report,
    group: { hero: computeHeroSummary(report.branches), kpis: computeKpiSummary(report.branches) },
    regions,
    scopes,
    isPublished: published,
    uploadedBranchCount: scom205Count,
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
