import { computeHeroSummary, computeKpiSummary, filterBranchesByRegion, type HeroSummary, type KpiSummary } from "./aggregate";
import { loadCancellationMonthSummaries, type CancellationMonthSummary } from "./cancellation/store";
import { REGIONS, type RegionName } from "./regions";
import { buildReport, type BranchReport, type Report } from "./report";
import { listSnapshotDates } from "./snapshot-store";
import { isDatePublished } from "./publish-store";

/**
 * The data foundation for the Accounts (finance) executive view (/accounts).
 * Company-wide only, like /vp and /ceo — no branch/region/publish gate.
 * Purely financial: revenue-stream breakdown (GUS/BPU parts & labour,
 * External Sales, VAS Bill, Scrap/Used Oil) plus Cancellations shown as its
 * own line — gross revenue, never netted (see cancellation/store.ts: "control/
 * audit only — nothing here feeds a revenue figure").
 */

export type AccountsRegionRollup = {
  region: RegionName;
  branches: BranchReport[];
  hero: HeroSummary;
  kpis: KpiSummary;
  cancellations: { count: number; beforeTaxTotal: number; afterTaxTotal: number };
};

export type AccountsData = {
  date: string;
  dates: string[];
  month: string;
  /** Null when no BA Tool report exists for `date` yet — a date without an
   * upload is pickable now (branches are backfilling from January onward),
   * so this is expected, not an error. */
  report: Report | null;
  group: { hero: HeroSummary; kpis: KpiSummary; cancellations: { count: number; beforeTaxTotal: number; afterTaxTotal: number } } | null;
  regions: AccountsRegionRollup[];
  cancellationsByBranch: Map<string, CancellationMonthSummary>;
  isPublished: boolean;
  uploadedBranchCount: number;
  totalBranchCount: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sumCancellations(rows: CancellationMonthSummary[]): { count: number; beforeTaxTotal: number; afterTaxTotal: number } {
  return rows.reduce(
    (acc, r) => ({ count: acc.count + r.count, beforeTaxTotal: acc.beforeTaxTotal + r.beforeTaxTotal, afterTaxTotal: acc.afterTaxTotal + r.afterTaxTotal }),
    { count: 0, beforeTaxTotal: 0, afterTaxTotal: 0 },
  );
}

export async function loadAccountsData(requestedDate?: string): Promise<AccountsData | null> {
  const dates = await listSnapshotDates();
  if (dates.length === 0) return null;

  const date = requestedDate && DATE_RE.test(requestedDate) ? requestedDate : dates.at(-1)!;
  const month = date.slice(0, 7);

  const [report, allCancellationSummaries, published] = await Promise.all([buildReport(date), loadCancellationMonthSummaries(), isDatePublished(date)]);

  if (!report) {
    return { date, dates, month, report: null, group: null, regions: [], cancellationsByBranch: new Map(), isPublished: published, uploadedBranchCount: 0, totalBranchCount: 18 };
  }

  const monthSummaries = allCancellationSummaries.filter((s) => s.month === month);
  const cancellationsByBranch = new Map(monthSummaries.map((s) => [s.branch, s]));

  const regions: AccountsRegionRollup[] = (Object.keys(REGIONS) as RegionName[]).map((region) => {
    const branches = filterBranchesByRegion(report.branches, region);
    const regionCancellations = monthSummaries.filter((s) => (REGIONS[region] as readonly string[]).includes(s.branch));
    return {
      region,
      branches,
      hero: computeHeroSummary(branches),
      kpis: computeKpiSummary(branches),
      cancellations: sumCancellations(regionCancellations),
    };
  });

  const hasCo01c = report.branches.some((b) => b.branch === "CO01C");

  return {
    date,
    dates,
    month,
    report,
    group: { hero: computeHeroSummary(report.branches), kpis: computeKpiSummary(report.branches), cancellations: sumCancellations(monthSummaries) },
    regions,
    cancellationsByBranch,
    isPublished: published,
    uploadedBranchCount: report.branches.length,
    totalBranchCount: 18 + (hasCo01c ? 1 : 0),
  };
}
