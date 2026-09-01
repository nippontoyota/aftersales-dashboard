import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { CollapsibleCard } from "@/components/collapsible-card";
import { RevenueIcon, WrenchIcon, TargetIcon, PercentIcon, StorefrontIcon } from "@/components/dashboard-icons";
import { RichKpiCard } from "@/components/rich-kpi-card";
import { achievementRatio, computeHeroSummary, computeKpiSummary } from "@/lib/aggregate";
import { getCurrentAdmin } from "@/lib/auth";
import type { AdminAccount } from "@/lib/admin-store";
import { loadDashboardData } from "@/lib/dashboard-data";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import { computePace } from "@/lib/pace";
import { computeTrendSeries, computeVasTrendSeries } from "@/lib/trend";
import { AchievementDonut } from "./achievement-donut";
import { AlertsPanel } from "./alerts-panel";
import { HeroKpi } from "./hero-kpi";
import { InsightsPanel } from "./insights-panel";
import { RegionScorecard } from "./region-scorecard";
import { TrendChart } from "./trend-chart";

/** Full company-wide Executive Overview for everyone — HQ and branch
 * admins alike (2026-08-29's "locked to own branch, numbers only" reversed
 * 2026-08-31, at the user's request: branch admins get the whole
 * dashboard back, identical to HQ's own view). Gated only by publish
 * status, enforced inside loadDashboardData — not by role here.
 *
 * Split into a fast shell (just the session/admin check, so AppShell and
 * the sidebar nav render immediately) and a Suspense-wrapped content
 * component carrying the real, slower dashboard query — a click on this
 * nav item used to sit frozen with zero feedback until the whole page,
 * sidebar included, was ready (2026-09-01, at the user's request). */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; region?: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin?.canViewDashboard) {
    redirect("/upload");
  }
  const identity = admin.role === "hq" ? "HQ admin" : `${admin.branch} branch`;

  return (
    <AppShell current="dashboard" showDashboardLink isHq={admin.role === "hq"} identity={identity}>
      <Suspense fallback={<DashboardPageSkeleton heroCards={5} />}>
        <DashboardContent searchParams={searchParams} admin={admin} />
      </Suspense>
    </AppShell>
  );
}

async function DashboardContent({
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
      <div className="mx-auto w-full max-w-2xl p-6">
        <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>
        <div className="mt-4 rounded border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          {admin.role === "hq"
            ? "No BA Tool reports have been uploaded yet. Go to Upload to add today's file."
            : "Nothing has been published yet — check back once HQ publishes a day's dashboard."}
        </div>
      </div>
    );
  }

  const { date, region, dates, report, filteredBranches, kpis, hasPreviousUpload, monthSnapshots, serviceInfoMonthSnapshots, isPublished, canPublish } =
    data;

  if (!report) {
    return (
      <div className="p-6">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">Could not load the report for {date}.</div>
      </div>
    );
  }

  const allKpis = computeKpiSummary(report.branches);
  const heroSummary = computeHeroSummary(filteredBranches);

  const trendSeriesByMetric = { vas: computeVasTrendSeries(monthSnapshots, serviceInfoMonthSnapshots, region) };
  const gusRoSeries = computeTrendSeries(monthSnapshots, region, "gus").map((p) => p.actual);
  const bpuRoSeries = computeTrendSeries(monthSnapshots, region, "bpus").map((p) => p.actual);

  const pace = {
    vas: computePace(date, kpis.vasAchievementForTheMonth, kpis.vasBillTarget),
    gusRo: computePace(date, kpis.gusRoMtd, null),
    bpuRo: computePace(date, kpis.bpuRoMtd, null),
  };

  const vasGentani = achievementRatio(kpis.vasAchievementForTheMonth, kpis.gusRoMtd);

  // Same date/region preservation as tkm-targets/page.tsx's alertsHref — no
  // `watched` param needed here since VAS is already /alerts' own default.
  const alertsHrefParams = new URLSearchParams({ date });
  if (region !== "All") alertsHrefParams.set("region", region);
  const alertsHref = `/alerts?${alertsHrefParams.toString()}`;

  const uploadedAtLabel = new Date(report.uploadedAt).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className="p-6">
      <DashboardPageHeader
        title="Executive Overview"
        basePath="/dashboard"
        date={date}
        region={region}
        dates={dates}
        branchCount={filteredBranches.length}
        hasPreviousUpload={hasPreviousUpload}
        previousDate={report.previousDate}
        daysSincePrevious={report.daysSincePrevious}
        isPublished={isPublished}
        canPublish={canPublish}
      />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <RichKpiCard
          icon={<RevenueIcon />}
          color="indigo"
          label="Total Revenue Stream MTD"
          value={formatCompactCurrency(heroSummary.totalRevenueStreamMtd)}
          hasPreviousUpload={hasPreviousUpload}
        />
        <RichKpiCard
          icon={<RevenueIcon />}
          color="red"
          label="GUS RO — MTD"
          value={formatNumber(kpis.gusRoMtd)}
          hasPreviousUpload={hasPreviousUpload}
          sparklineValues={gusRoSeries}
          pace={pace.gusRo}
        />
        <RichKpiCard
          icon={<WrenchIcon />}
          color="blue"
          label="BPU RO — MTD"
          value={formatNumber(kpis.bpuRoMtd)}
          hasPreviousUpload={hasPreviousUpload}
          sparklineValues={bpuRoSeries}
          pace={pace.bpuRo}
        />
        <RichKpiCard
          icon={<RevenueIcon />}
          color="amber"
          label="External Sales MTD"
          value={formatCompactCurrency(kpis.externalSalesMtd)}
          hasPreviousUpload={hasPreviousUpload}
        />
        <RichKpiCard
          icon={<StorefrontIcon />}
          color="indigo"
          label="VAS Achievement"
          value={formatCompactCurrency(kpis.vasAchievementForTheMonth)}
          actual={kpis.vasAchievementForTheMonth}
          target={kpis.vasBillTarget}
          hasPreviousUpload={hasPreviousUpload}
          pace={pace.vas}
          formatPaceValue={formatCompactCurrency}
        />
      </div>

      <div className="mt-4">
        <HeroKpi branches={report.branches} compact />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendChart seriesByMetric={trendSeriesByMetric} />
        <AchievementDonut branches={filteredBranches} />
      </div>

      <div className="mt-4">
        <RegionScorecard
          branches={report.branches}
          monthSnapshots={monthSnapshots}
          serviceInfoMonthSnapshots={serviceInfoMonthSnapshots}
          date={date}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <InsightsPanel kpis={allKpis} branches={report.branches} date={date} />
        <AlertsPanel branches={filteredBranches} variant="preview" viewAllHref={alertsHref} />
      </div>

      <div className="mt-4">
        <CollapsibleCard title="Other KPIs" defaultOpen>
          <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-2">
            <RichKpiCard icon={<PercentIcon />} color="violet" label="External Sales % on SPR I" value={formatPercent(kpis.externalSalesPctOfSprInternal)} sub="avg across branches" />
            <RichKpiCard icon={<TargetIcon />} color="indigo" label="VAS Gentani" value={formatCompactCurrency(vasGentani)} sub="VAS revenue per GUS RO" />
          </div>
        </CollapsibleCard>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[11px] text-slate-400">
        <span>Data as of: {uploadedAtLabel} IST</span>
        <span>Figures rounded for display · full precision on hover</span>
      </div>
    </div>
  );
}
