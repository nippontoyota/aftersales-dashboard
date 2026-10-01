import {
  achievementRatio,
  computeHeroSummary,
  computeKpiSummary,
  filterBranchesByRegion,
  type AchievementTone,
  type HeroSummary,
  type KpiSummary,
} from "./aggregate";
import { aggregateIncentiveSlabTargets } from "./incentive-slabs/aggregate";
import { loadIncentiveSlabTargets, type IncentiveSlabTargets } from "./incentive-slabs/store";
import { computePace, paceTone, type Pace } from "./pace";
import { REGIONS, regionForBranch, type RegionName } from "./regions";
import { buildReport, isBodyPaintOnly, type BranchReport, type Report } from "./report";
import { listSnapshotDates } from "./snapshot-store";
import { isDatePublished } from "./publish-store";
import { loadScom205BranchesForDate } from "./scom205/store";
import { loadReportHolidaySet } from "./report-holidays/store";

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
  bpuPartsMtd: number | null;
  bpuLabourMtd: number | null;
  gusPartsPerCar: number | null;
  gusLabourPerCar: number | null;
  gusRoMtd: number | null;
  bpuRevenueBodyPaintOnlyMtd: number | null;
  bpuRevenueOtherMtd: number | null;
  bpuRoMtd: number | null;
  tglossMtd: number | null;
  tglossTarget: number | null;
  tglossPct: number | null;
  /** Run-rate/gap/projected-EOM for TGLOSS against its own target — see lib/pace.ts. */
  tglossPace: Pace;
  /** Pace-vs-expected-progress tone, same methodology as the CEO dashboard's KPI cards. */
  tglossPaceTone: AchievementTone;
  /** Run-rate/projected-EOM for GUS Parts MTD. No confirmed per-car or MTD target exists for
   * this figure, so target/gap/requiredRatePerDay are always null — only the run-rate math holds. */
  gusPartsPace: Pace;
  /** Same as gusPartsPace, for GUS Labour MTD. */
  gusLabourPace: Pace;
  /** Same as gusPartsPace, for BPU Parts MTD (straight group total — not the
   * Body & Paint-only-vs-other split that bpuRevenueBodyPaintOnlyMtd/
   * bpuRevenueOtherMtd carry). */
  bpuPartsPace: Pace;
  /** Same as bpuPartsPace, for BPU Labour MTD. */
  bpuLabourPace: Pace;
  externalSalesMtd: number | null;
  /** Same as gusPartsPace, for External Sales MTD. */
  externalSalesPace: Pace;
  scrapAndUsedOilMtd: number | null;
  /** Undefined when none of this scope's branches have a slab target loaded this month. */
  incentiveSlabs: IncentiveSlabTargets | undefined;
};

export type TglossException = {
  branch: string;
  region: RegionName | null;
  tone: "warn" | "critical";
  actual: number | null;
  target: number | null;
  gap: number | null;
  requiredRatePerDay: number | null;
  projectedEom: number | null;
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
  /** Branch codes present in the report that haven't filed their scom205 for
   * `date` yet — feeds the DraftWarning banner's "who's missing" list
   * (VP-only, 2026-10-01). Always [] once published (nobody's waiting on
   * anyone by then) or when there's no report. */
  missingBranches: string[];
  /** Branches off-pace for their own TGLOSS incentive-slab target this month, worst first —
   * see computeTglossExceptions() below. */
  tglossExceptions: TglossException[];
  /** The Group scope as of the previous upload (`report.previousDate`) — feeds the hero
   * cards' trend chips ("vs last upload"). Null when there's no previous upload this month. */
  previousScope: VpScopeMetrics | null;
  /** The Group scope on the same calendar day last month (clamped to that month's last day
   * if it's shorter) — feeds the headline's month-over-month sentence. Null when that date
   * has no report at all (2026-09-26: real data only goes back to late August). */
  lastMonthScope: VpScopeMetrics | null;
  /** This month's Slab 1–4 targets, keyed by branch — feeds the Regions section's
   * per-branch slab table (vp-branch-slab-table.tsx). A branch with no entry has no
   * target loaded for this month, same "drops out" rule as everywhere else. */
  incentiveSlabTargetsByBranch: Record<string, IncentiveSlabTargets>;
  /** HQ-flagged report_holidays, as an array — every pace/forecast call on
   * this page reuses this same set (2026-09-29). */
  holidays: string[];
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
  incentiveSlabTargets: Record<string, IncentiveSlabTargets>,
  date: string,
  holidays: ReadonlySet<string>
): VpScopeMetrics {
  const hero = computeHeroSummary(branches);
  const kpis = computeKpiSummary(branches);
  return {
    label,
    region,
    totalRevenueStreamMtd: hero.totalRevenueStreamMtd,
    gusPartsMtd: hero.gusPartsMtd,
    gusLabourMtd: hero.gusLabourMtd,
    bpuPartsMtd: hero.bpuPartsMtd,
    bpuLabourMtd: hero.bpuLabourMtd,
    gusPartsPerCar: perCar(hero.gusPartsMtd, hero.gusRoMtd),
    gusLabourPerCar: perCar(hero.gusLabourMtd, hero.gusRoMtd),
    gusRoMtd: hero.gusRoMtd,
    bpuRevenueBodyPaintOnlyMtd: sumBpuRevenue(branches, true),
    bpuRevenueOtherMtd: sumBpuRevenue(branches, false),
    bpuRoMtd: hero.bpuRoMtd,
    tglossMtd: kpis.vasAchievementForTheMonth,
    tglossTarget: kpis.vasBillTarget,
    tglossPct: achievementRatio(kpis.vasAchievementForTheMonth, kpis.vasBillTarget),
    tglossPace: computePace(date, kpis.vasAchievementForTheMonth, kpis.vasBillTarget, holidays),
    tglossPaceTone: paceTone(date, kpis.vasAchievementForTheMonth, kpis.vasBillTarget, holidays),
    gusPartsPace: computePace(date, hero.gusPartsMtd, null, holidays),
    gusLabourPace: computePace(date, hero.gusLabourMtd, null, holidays),
    bpuPartsPace: computePace(date, hero.bpuPartsMtd, null, holidays),
    bpuLabourPace: computePace(date, hero.bpuLabourMtd, null, holidays),
    externalSalesMtd: hero.externalSalesMtd,
    externalSalesPace: computePace(date, hero.externalSalesMtd, null, holidays),
    scrapAndUsedOilMtd: hero.scrapRevenueMtd !== null || hero.usedOilRevenueMtd !== null
      ? (hero.scrapRevenueMtd ?? 0) + (hero.usedOilRevenueMtd ?? 0)
      : null,
    incentiveSlabs: aggregateIncentiveSlabTargets(
      incentiveSlabTargets,
      branches.map((b) => b.branch)
    ),
  };
}

/** Branches off-pace for their own TGLOSS incentive-slab target this month
 * (2026-09-25, the VP's "exception surfacing" ask) — graded against each
 * branch's own vasBillTarget via the same paceTone() the incentive slab
 * rings already use, never a week/month-over-month comparison (the VP's
 * original brief ruled those out). Worst first — critical before warn,
 * furthest off-pace first within each. Body & Paint-only branches never
 * appear here: their vasBillTarget derives from a GUS RO count that's
 * forced to 0 for them, so paceTone() always reads "neutral" (no target). */
function computeTglossExceptions(branches: BranchReport[], date: string, holidays: ReadonlySet<string>): TglossException[] {
  const rows: TglossException[] = [];
  for (const b of branches) {
    const tone = paceTone(date, b.vasAchievementForTheMonth, b.vasBillTarget, holidays);
    if (tone !== "warn" && tone !== "critical") continue;
    const pace = computePace(date, b.vasAchievementForTheMonth, b.vasBillTarget, holidays);
    rows.push({
      branch: b.branch,
      region: regionForBranch(b.branch),
      tone,
      actual: b.vasAchievementForTheMonth,
      target: b.vasBillTarget,
      gap: pace.gap,
      requiredRatePerDay: pace.requiredRatePerDay,
      projectedEom: pace.projectedEom,
    });
  }
  rows.sort((a, b) => {
    if (a.tone !== b.tone) return a.tone === "critical" ? -1 : 1;
    return (b.gap ?? 0) - (a.gap ?? 0);
  });
  return rows;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Off until October: the month-over-month headline is hidden on /vp, so the extra full-report load it needs is skipped. Flip to true together with re-adding <VpHeadline> in vp/page.tsx. */
const INCLUDE_LAST_MONTH_SCOPE = false;

/** The same calendar day one month earlier, clamped to that month's last day
 * when it's shorter (e.g. Mar 31 → Feb 28/29) — for the headline's
 * month-over-month comparison. */
function sameDayLastMonth(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const daysInPrevMonth = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const clampedDay = Math.min(d, daysInPrevMonth);
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

/** Just the Group scope for one comparison date — used for the hero cards'
 * "vs last upload" trend chips and the headline's month-over-month
 * sentence, neither of which need the full regions/exceptions machinery
 * loadVpData itself builds. Null when that date has no report at all. */
async function loadGroupScope(date: string, holidays: ReadonlySet<string>): Promise<VpScopeMetrics | null> {
  const [report, incentiveSlabTargetsMap] = await Promise.all([buildReport(date), loadIncentiveSlabTargets(date.slice(0, 7))]);
  if (!report) return null;
  const incentiveSlabTargets = Object.fromEntries(incentiveSlabTargetsMap);
  return buildScopeMetrics("Group", null, report.branches, incentiveSlabTargets, date, holidays);
}

export async function loadVpData(requestedDate?: string): Promise<VpData | null> {
  const dates = await listSnapshotDates();
  if (dates.length === 0) return null;

  const date = requestedDate && DATE_RE.test(requestedDate) ? requestedDate : dates.at(-1)!;
  const [report, published, uploadedBranches, incentiveSlabTargetsMap, holidaySet] = await Promise.all([
    buildReport(date),
    isDatePublished(date),
    loadScom205BranchesForDate(date),
    loadIncentiveSlabTargets(date.slice(0, 7)),
    loadReportHolidaySet(),
  ]);
  const incentiveSlabTargets = Object.fromEntries(incentiveSlabTargetsMap);
  const holidays = [...holidaySet];

  if (!report)
    return {
      date,
      dates,
      report: null,
      group: null,
      regions: [],
      scopes: [],
      isPublished: published,
      uploadedBranchCount: 0,
      totalBranchCount: 18,
      missingBranches: [],
      tglossExceptions: [],
      previousScope: null,
      lastMonthScope: null,
      incentiveSlabTargetsByBranch: {},
      holidays,
    };

  const regions: VpRegionRollup[] = (Object.keys(REGIONS) as RegionName[]).map((region) => {
    const branches = filterBranchesByRegion(report.branches, region);
    return { region, branches, hero: computeHeroSummary(branches), kpis: computeKpiSummary(branches) };
  });

  const scopes: VpScopeMetrics[] = [
    buildScopeMetrics("Group", null, report.branches, incentiveSlabTargets, date, holidaySet),
    ...(Object.keys(REGIONS) as RegionName[]).map((region) =>
      buildScopeMetrics(region, region, filterBranchesByRegion(report.branches, region), incentiveSlabTargets, date, holidaySet)
    ),
  ];

  const hasCo01c = report.branches.some((b) => b.branch === "CO01C");

  // Each loadGroupScope() call is a full buildReport() underneath — a dozen
  // more concurrent queries against the shared pool. Only worth paying for
  // once today's own upload is trustworthy enough to compare against (an
  // in-progress draft would produce a meaningless "trend" anyway — see
  // vp-headline.tsx/vp-kpi-cards.tsx, which both skip rendering these when
  // null); skipping them on every other day also keeps this page from
  // tripling its DB load on every request. Sequential, not Promise.all'd
  // together — two buildReport()s firing their ~12 queries at once
  // previously caused an isDatePublished query to fail outright (confirmed
  // 2026-09-28) on the shared connection pool.
  let previousScope: VpScopeMetrics | null = null;
  let lastMonthScope: VpScopeMetrics | null = null;
  if (published) {
    previousScope = report.previousDate ? await loadGroupScope(report.previousDate, holidaySet) : null;
    if (INCLUDE_LAST_MONTH_SCOPE) lastMonthScope = await loadGroupScope(sameDayLastMonth(date), holidaySet);
  }

  return {
    date,
    dates,
    report,
    group: { hero: computeHeroSummary(report.branches), kpis: computeKpiSummary(report.branches) },
    regions,
    scopes,
    tglossExceptions: computeTglossExceptions(report.branches, date, holidaySet),
    isPublished: published,
    uploadedBranchCount: uploadedBranches.length,
    totalBranchCount: 18 + (hasCo01c ? 1 : 0),
    missingBranches: report.branches.map((b) => b.branch).filter((code) => !uploadedBranches.includes(code)),
    previousScope,
    lastMonthScope,
    incentiveSlabTargetsByBranch: incentiveSlabTargets,
    holidays,
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
