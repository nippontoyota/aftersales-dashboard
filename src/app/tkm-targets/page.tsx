import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { TargetIcon, WrenchIcon, StorefrontIcon } from "@/components/dashboard-icons";
import { RichKpiCard } from "@/components/rich-kpi-card";
import { tglossText } from "@/components/tgloss-text";
import { achievementRatio, computeKpiSummary, TKM_TRACKED_KPIS } from "@/lib/aggregate";
import { adminIdentityLabel, type AdminAccount } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadDashboardData, loadNavState } from "@/lib/dashboard-data";
import { NoDataForDate } from "@/components/no-data-for-date";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import { computePace, paceTone } from "@/lib/pace";
import { computeTrendSeries } from "@/lib/trend";
import { BranchPerformanceHeatmap, type HeatmapMetricConfig } from "../dashboard/branch-performance-heatmap";
import { InsightsPanel } from "../dashboard/insights-panel";
import { MetricSyncProvider } from "../dashboard/metric-sync";
import { RegionScorecard, type RegionMetricConfig } from "../dashboard/region-scorecard";
import { TkmReportTable } from "../dashboard/tkm-report-table";
import { TrendChart, type TrendMetricConfig } from "../dashboard/trend-chart";

/** CPU/BPU/Offtake/Parts Retail/PM+OC — TKM's own official target
 * categories, moved here from the main Dashboard as their own page
 * (2026-08-31, at the user's request). Full company-wide view for
 * everyone, same as Dashboard/Alerts/Branches/Reports — gated only by
 * publish status (see dashboard-data.ts), not by role. */

const TREND_METRICS: TrendMetricConfig[] = [
  { key: "partsRetail", label: "Parts Retail", isCurrency: true },
  { key: "bpu", label: "BPU" },
  { key: "offtake", label: "Offtake", isCurrency: true },
  { key: "pmOc", label: "PM+OC" },
];

const REGION_METRICS: RegionMetricConfig[] = [
  { key: "partsRetail", label: "Parts Retail (Rs)", actual: "partsRetailAchievementForTheMonth", target: "partsRetailTarget", baToolActual: "sprInternal", baToolTarget: "sprInternalTarget", isCurrency: true },
  { key: "bpu", label: "BPU", actual: "bpuAchievementForTheMonth", target: "bpuTarget", baToolActual: "bpus", baToolTarget: "bpusTarget", isCurrency: false },
  { key: "offtake", label: "Offtake (Rs)", actual: "offtakeAchievementForTheMonth", target: "offtakeTarget", baToolActual: "spoDealer", baToolTarget: "spoDealerTarget", isCurrency: true },
  { key: "pmOc", label: "PM+OC", actual: "pmOcAchievementForTheMonth", target: "pmOcTarget", baToolActual: "pm", baToolTarget: "pmTarget", isCurrency: false },
];

const HEATMAP_METRICS: HeatmapMetricConfig[] = [
  { label: "Parts Retail", actual: "partsRetailAchievementForTheMonth", target: "partsRetailTarget", syncKey: "partsRetail", baToolActual: "sprInternal", baToolTarget: "sprInternalTarget" },
  { label: "BPU Ach.", actual: "bpuAchievementForTheMonth", target: "bpuTarget", syncKey: "bpu", baToolActual: "bpus", baToolTarget: "bpusTarget" },
  { label: "Offtake", actual: "offtakeAchievementForTheMonth", target: "offtakeTarget", syncKey: "offtake", baToolActual: "spoDealer", baToolTarget: "spoDealerTarget" },
  { label: "PM+OC", actual: "pmOcAchievementForTheMonth", target: "pmOcTarget", syncKey: "pmOc", baToolActual: "pm", baToolTarget: "pmTarget" },
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
  if (admin?.role === "vp_service") redirect("/vp");
  if (admin?.role === "ceo") redirect("/ceo");
  if (admin?.role === "accounts") redirect("/accounts");
  if (!admin?.canViewDashboard) redirect("/upload");
  // Company-wide pages are hidden from a branch admin until their latest
  // date is published — before that they only get the Daily Report.
  const nav = await loadNavState(admin);
  // Company-wide tools are HQ-only now — branch / regional get everything on
  // their own dashboard (slim nav, so there is no link here anyway; this
  // covers a bookmark or typed URL).
  if (admin.role !== "hq" && admin.role !== "hq_viewer") redirect("/dashboard");
  const identity = adminIdentityLabel(admin);

  return (
    <AppShell current="tkm-targets" showDashboardLink isHq={admin.role === "hq"} companyTabs={nav.companyTabs} canUpload={nav.canUpload} queriesBadge={nav.queriesBadge} identity={identity}>
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

  if (!data) {
    return (
      <div className="mx-auto max-w-[1600px] p-6">
        <h1 className="text-lg font-semibold text-fg">TKM Targets</h1>
        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
      </div>
    );
  }
  if (!data.report) {
    return <NoDataForDate title="TKM Targets" date={data.date} dates={data.dates} basePath="/tkm-targets" />;
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
    bpu: computePace(date, kpis.bpuAchievementForTheMonth, kpis.bpuTarget),
    offtake: computePace(date, kpis.offtakeAchievementForTheMonth, kpis.offtakeTarget),
    partsRetail: computePace(date, kpis.partsRetailAchievementForTheMonth, kpis.partsRetailTarget),
    pmOc: computePace(date, kpis.pmOcAchievementForTheMonth, kpis.pmOcTarget),
  };

  // Same pace methodology everywhere on this page (2026-09-19, at the user's
  // request) — one paceTone call per KPI, reused for the card's status chip,
  // matching the heatmap/region-card/insights logic exactly.
  const tone = {
    bpu: paceTone(date, kpis.bpuAchievementForTheMonth, kpis.bpuTarget),
    offtake: paceTone(date, kpis.offtakeAchievementForTheMonth, kpis.offtakeTarget),
    partsRetail: paceTone(date, kpis.partsRetailAchievementForTheMonth, kpis.partsRetailTarget),
    pmOc: paceTone(date, kpis.pmOcAchievementForTheMonth, kpis.pmOcTarget),
  };

  return (
    <div className="mx-auto max-w-[1600px] p-6">
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
        branchOptions={report.branches.map((b) => b.branch)}
      />

      {/* Four target-based KPIs are the primary cards; CPU has no target
          anywhere in the data (confirmed 2026-09-19) so it's a visually
          smaller, clearly-labelled secondary card — actual + run rate only,
          never styled as if it were comparable to an achievement %. */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RichKpiCard
          icon={<WrenchIcon />}
          color="blue"
          label="BPU Achievement"
          value={formatNumber(kpis.bpuAchievementForTheMonth)}
          actual={kpis.bpuAchievementForTheMonth}
          target={kpis.bpuTarget}
          hasPreviousUpload={hasPreviousUpload}
          pace={pace.bpu}
          paceTone={tone.bpu}
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
          paceTone={tone.offtake}
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
          paceTone={tone.partsRetail}
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
          paceTone={tone.pmOc}
        />
      </div>

      {/* CPU Achievement MTD removed 2026-09-19, at the user's request —
          replaced by this compact card of three related figures, none of
          which are target-graded, so this stays a plain figures card, not a
          RichKpiCard. */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <div className="text-[11px] font-medium tracking-[0.01em] text-fg-subtle">Service Metrics MTD</div>
          <dl className="mt-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <dt className="text-xs text-fg-faint">Service Gentan I</dt>
              <dd className="text-sm font-semibold tabular-nums text-fg">{formatCompactCurrency(kpis.serviceGentanI)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs text-fg-faint">Service Penetration</dt>
              <dd className="text-sm font-semibold tabular-nums text-fg">{formatPercent(kpis.penetrationTGlossService)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs text-fg-faint">{tglossText("TGLOSS SPO")}</dt>
              <dd className="text-sm font-semibold tabular-nums text-fg">{formatPercent(achievementRatio(kpis.spoTGloss, kpis.spoTGlossTarget))}</dd>
            </div>
          </dl>
        </div>

        {/* Battery/Tyre actuals + their share of PM, pulled straight from the
            BA Tool (2026-09-21, at the user's request) — plain figures, not
            target-graded, same treatment as Service Metrics MTD. */}
        <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <div className="text-[11px] font-medium tracking-[0.01em] text-fg-subtle">Battery &amp; Tyre MTD</div>
          <dl className="mt-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <dt className="text-xs text-fg-faint">Battery Actuals</dt>
              <dd className="text-sm font-semibold tabular-nums text-fg">{formatNumber(kpis.batterySalesForTheMonth)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs text-fg-faint">Tyre Actual</dt>
              <dd className="text-sm font-semibold tabular-nums text-fg">{formatNumber(kpis.tireSalesForTheMonth)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <div className="text-[11px] font-medium tracking-[0.01em] text-fg-subtle">Battery+Tyre / PM %</div>
          <dl className="mt-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <dt className="text-xs text-fg-faint">(Battery + Tyre) of PM Actual</dt>
              <dd className="text-sm font-semibold tabular-nums text-fg">
                {formatPercent(
                  achievementRatio(
                    (kpis.batterySalesForTheMonth ?? 0) + (kpis.tireSalesForTheMonth ?? 0),
                    kpis.pmOcAchievementForTheMonth
                  )
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Trend / Region Scorecard / Heatmap sort all share one metric
          selection — pick BPU (etc.) in any dropdown and all three switch,
          per the user's 2026-09-19 request. */}
      <MetricSyncProvider initialMetric={TREND_METRICS[0].key}>
        <div className="mt-4">
          <TrendChart seriesByMetric={trendSeriesByMetric} metrics={TREND_METRICS} date={date} chartHeight={150} />
        </div>

        <div className="mt-4">
          <RegionScorecard branches={report.branches} monthSnapshots={monthSnapshots} metrics={REGION_METRICS} date={date} />
        </div>

        <div className="mt-4">
          <BranchPerformanceHeatmap branches={filteredBranches} metrics={HEATMAP_METRICS} date={date} monthSnapshots={monthSnapshots} />
        </div>
      </MetricSyncProvider>

      <div className="mt-4">
        <InsightsPanel
          kpis={allKpis}
          branches={report.branches}
          date={date}
          trackedKpis={TKM_TRACKED_KPIS}
          perBranchMetrics={PER_BRANCH_METRICS}
          regionGapMetric={REGION_GAP_METRIC}
          maxVisible={3}
        />
      </div>

      <div className="mt-4">
        <TkmReportTable branches={filteredBranches} daysSincePrevious={report.daysSincePrevious} />
      </div>
    </div>
  );
}
