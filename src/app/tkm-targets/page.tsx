import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { TargetIcon, WrenchIcon, StorefrontIcon } from "@/components/dashboard-icons";
import { RichKpiCard } from "@/components/rich-kpi-card";
import { computeKpiSummary, TKM_TRACKED_KPIS } from "@/lib/aggregate";
import type { AdminAccount } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadDashboardData } from "@/lib/dashboard-data";
import { formatCompactCurrency, formatNumber } from "@/lib/format";
import { computePace } from "@/lib/pace";
import { computeTrendSeries } from "@/lib/trend";
import { AchievementDonut, type DonutMetricConfig } from "../dashboard/achievement-donut";
import { AlertsPanel, TKM_WATCHED } from "../dashboard/alerts-panel";
import { BranchPerformanceBars, type BarsMetricConfig } from "../dashboard/branch-performance-bars";
import { BranchPerformanceHeatmap, type HeatmapMetricConfig } from "../dashboard/branch-performance-heatmap";
import { BranchRankingChart, TKM_RANKING_METRICS } from "../dashboard/branch-ranking-chart";
import { InsightsPanel } from "../dashboard/insights-panel";
import { RegionScorecard, type RegionMetricConfig } from "../dashboard/region-scorecard";
import { TkmReportTable } from "../dashboard/tkm-report-table";
import { TrendChart, type TrendMetricConfig } from "../dashboard/trend-chart";

/** CPU/BPU/Offtake/Parts Retail/PM+OC — TKM's own official target
 * categories, moved here from the main Dashboard as their own page
 * (2026-08-31, at the user's request). Full company-wide view for
 * everyone, same as Dashboard/Alerts/Branches/Reports — gated only by
 * publish status (see dashboard-data.ts), not by role. */

const DONUT_METRICS: DonutMetricConfig[] = [
  { key: "partsRetail", label: "Parts Retail", actual: "partsRetailAchievementForTheMonth", target: "partsRetailTarget" },
  { key: "bpu", label: "BPU", actual: "bpuAchievementForTheMonth", target: "bpuTarget" },
  { key: "offtake", label: "Offtake", actual: "offtakeAchievementForTheMonth", target: "offtakeTarget" },
  { key: "pmOc", label: "PM+OC", actual: "pmOcAchievementForTheMonth", target: "pmOcTarget" },
];

const TREND_METRICS: TrendMetricConfig[] = [
  { key: "partsRetail", label: "Parts Retail (Rs)" },
  { key: "bpu", label: "BPU" },
  { key: "offtake", label: "Offtake (Rs)" },
  { key: "pmOc", label: "PM+OC" },
];

const REGION_METRICS: RegionMetricConfig[] = [
  { key: "partsRetail", label: "Parts Retail (Rs)", actual: "partsRetailAchievementForTheMonth", target: "partsRetailTarget", baToolActual: "sprInternal", baToolTarget: "sprInternalTarget", isCurrency: true },
  { key: "bpu", label: "BPU", actual: "bpuAchievementForTheMonth", target: "bpuTarget", baToolActual: "bpus", baToolTarget: "bpusTarget", isCurrency: false },
  { key: "offtake", label: "Offtake (Rs)", actual: "offtakeAchievementForTheMonth", target: "offtakeTarget", baToolActual: "spoDealer", baToolTarget: "spoDealerTarget", isCurrency: true },
  { key: "pmOc", label: "PM+OC", actual: "pmOcAchievementForTheMonth", target: "pmOcTarget", baToolActual: "pm", baToolTarget: "pmTarget", isCurrency: false },
];

const HEATMAP_METRICS: HeatmapMetricConfig[] = [
  { label: "Parts Retail", actual: "partsRetailAchievementForTheMonth", target: "partsRetailTarget" },
  { label: "BPU Ach.", actual: "bpuAchievementForTheMonth", target: "bpuTarget" },
  { label: "Offtake", actual: "offtakeAchievementForTheMonth", target: "offtakeTarget" },
  { label: "PM+OC", actual: "pmOcAchievementForTheMonth", target: "pmOcTarget" },
];

const BARS_METRICS: BarsMetricConfig[] = [
  { key: "partsRetail", label: "Parts Retail (Rs)", actual: "partsRetailAchievementForTheMonth", target: "partsRetailTarget" },
  { key: "bpu", label: "BPU", actual: "bpuAchievementForTheMonth", target: "bpuTarget" },
  { key: "offtake", label: "Offtake (Rs)", actual: "offtakeAchievementForTheMonth", target: "offtakeTarget" },
  { key: "pmOc", label: "PM+OC", actual: "pmOcAchievementForTheMonth", target: "pmOcTarget" },
];

const PER_BRANCH_METRICS = [
  { actual: "bpuAchievementForTheMonth" as const, target: "bpuTarget" as const },
  { actual: "offtakeAchievementForTheMonth" as const, target: "offtakeTarget" as const },
  { actual: "partsRetailAchievementForTheMonth" as const, target: "partsRetailTarget" as const },
  { actual: "pmOcAchievementForTheMonth" as const, target: "pmOcTarget" as const },
];

const REGION_GAP_METRIC = { actual: "partsRetailAchievementForTheMonth" as const, target: "partsRetailTarget" as const, label: "Parts Retail" };

export default async function TkmTargetsPage({ searchParams }: { searchParams: Promise<{ date?: string; region?: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin?.canViewDashboard) redirect("/upload");
  const identity = admin.role === "hq" ? "HQ admin" : `${admin.branch} branch`;

  return (
    <AppShell current="tkm-targets" showDashboardLink isHq={admin.role === "hq"} identity={identity}>
      <Suspense fallback={<DashboardPageSkeleton heroCards={5} />}>
        <TkmTargetsContent searchParams={searchParams} admin={admin} />
      </Suspense>
    </AppShell>
  );
}

async function TkmTargetsContent({
  searchParams,
  admin,
}: {
  searchParams: Promise<{ date?: string; region?: string }>;
  admin: AdminAccount;
}) {
  const params = await searchParams;
  const data = await loadDashboardData(params, admin);

  if (!data || !data.report) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold text-slate-900">TKM Targets</h1>
        <div className="mt-4 rounded border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          {admin.role === "hq" ? "No BA Tool reports have been uploaded yet." : "No BA Tool reports have been uploaded yet — check back once HQ uploads a day's data."}
        </div>
      </div>
    );
  }

  const { date, region, dates, report, filteredBranches, kpis, hasPreviousUpload, monthSnapshots, isPublished, canPublish, isCompanyScope } = data;
  const allKpis = computeKpiSummary(report.branches);

  const trendSeriesByMetric = {
    bpu: computeTrendSeries(monthSnapshots, region, "bpus", "bpusTarget"),
    offtake: computeTrendSeries(monthSnapshots, region, "spoDealer", "spoDealerTarget"),
    partsRetail: computeTrendSeries(monthSnapshots, region, "sprInternal", "sprInternalTarget"),
    pmOc: computeTrendSeries(monthSnapshots, region, "pm", "pmTarget"),
  };

  const pace = {
    cpu: computePace(date, kpis.cpuAchievementForTheMonth, null),
    bpu: computePace(date, kpis.bpuAchievementForTheMonth, kpis.bpuTarget),
    offtake: computePace(date, kpis.offtakeAchievementForTheMonth, kpis.offtakeTarget),
    partsRetail: computePace(date, kpis.partsRetailAchievementForTheMonth, kpis.partsRetailTarget),
    pmOc: computePace(date, kpis.pmOcAchievementForTheMonth, kpis.pmOcTarget),
  };

  // "View all" has to carry both the TKM watched-set (so /alerts counts the
  // same BPU/Offtake/Parts Retail/PM+OC alerts the preview just did, not its
  // own VAS default) and the current date/region — a bare "/alerts" used to
  // drop both, silently swapping to a different metric set (found
  // 2026-09-01) and resetting to the latest date.
  const alertsHrefParams = new URLSearchParams({ date, watched: "tkm" });
  if (region !== "All") alertsHrefParams.set("region", region);
  const alertsHref = `/alerts?${alertsHrefParams.toString()}`;

  return (
    <div className="p-6">
      <DashboardPageHeader
        title="TKM Targets"
        basePath="/tkm-targets"
        date={date}
        region={region}
        dates={dates}
        branchCount={filteredBranches.length}
        hasPreviousUpload={hasPreviousUpload}
        previousDate={report.previousDate}
        daysSincePrevious={report.daysSincePrevious}
        isPublished={isPublished}
        canPublish={canPublish}
        isCompanyScope={isCompanyScope}
      />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <RichKpiCard icon={<TargetIcon />} color="amber" label="CPU Achievement MTD" value={formatNumber(kpis.cpuAchievementForTheMonth)} sub="no target set" pace={pace.cpu} />
        <RichKpiCard
          icon={<WrenchIcon />}
          color="blue"
          label="BPU Achievement"
          value={formatNumber(kpis.bpuAchievementForTheMonth)}
          actual={kpis.bpuAchievementForTheMonth}
          target={kpis.bpuTarget}
          hasPreviousUpload={hasPreviousUpload}
          pace={pace.bpu}
        />
        <RichKpiCard
          icon={<TargetIcon />}
          color="violet"
          label="Offtake Achievement"
          value={formatCompactCurrency(kpis.offtakeAchievementForTheMonth)}
          actual={kpis.offtakeAchievementForTheMonth}
          target={kpis.offtakeTarget}
          hasPreviousUpload={hasPreviousUpload}
          pace={pace.offtake}
          formatPaceValue={formatCompactCurrency}
        />
        <RichKpiCard
          icon={<StorefrontIcon />}
          color="emerald"
          label="Parts Retail Achievement"
          value={formatCompactCurrency(kpis.partsRetailAchievementForTheMonth)}
          actual={kpis.partsRetailAchievementForTheMonth}
          target={kpis.partsRetailTarget}
          hasPreviousUpload={hasPreviousUpload}
          pace={pace.partsRetail}
          formatPaceValue={formatCompactCurrency}
        />
        <RichKpiCard
          icon={<TargetIcon />}
          color="blue"
          label="PM+OC Achievement"
          value={formatNumber(kpis.pmOcAchievementForTheMonth)}
          actual={kpis.pmOcAchievementForTheMonth}
          target={kpis.pmOcTarget}
          hasPreviousUpload={hasPreviousUpload}
          pace={pace.pmOc}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendChart seriesByMetric={trendSeriesByMetric} metrics={TREND_METRICS} />
        <AchievementDonut branches={filteredBranches} metrics={DONUT_METRICS} />
      </div>

      <div className="mt-4">
        <RegionScorecard branches={report.branches} monthSnapshots={monthSnapshots} date={date} metrics={REGION_METRICS} />
      </div>

      <div className="mt-4 space-y-4">
        <BranchPerformanceHeatmap branches={report.branches} metrics={HEATMAP_METRICS} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BranchPerformanceBars branches={report.branches} metrics={BARS_METRICS} />
          <BranchRankingChart branches={report.branches} metrics={TKM_RANKING_METRICS} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <InsightsPanel
          kpis={allKpis}
          branches={report.branches}
          date={date}
          trackedKpis={TKM_TRACKED_KPIS}
          perBranchMetrics={PER_BRANCH_METRICS}
          regionGapMetric={REGION_GAP_METRIC}
        />
        <AlertsPanel branches={filteredBranches} variant="preview" watched={TKM_WATCHED} viewAllHref={alertsHref} />
      </div>

      <div className="mt-4">
        <TkmReportTable branches={filteredBranches} daysSincePrevious={report.daysSincePrevious} />
      </div>
    </div>
  );
}
