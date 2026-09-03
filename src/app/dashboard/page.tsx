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
import { loadDashboardData, loadNavState } from "@/lib/dashboard-data";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import { computePace } from "@/lib/pace";
import { computeVasTrendSeries } from "@/lib/trend";
import { AchievementDonut } from "./achievement-donut";
import { AlertsPanel } from "./alerts-panel";
import { BillDrilldown } from "./bill-drilldown";
import { BranchDailyReport } from "./branch-daily-report";
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
  const nav = await loadNavState(admin);

  return (
    <AppShell
      current="dashboard"
      showDashboardLink
      isHq={admin.role === "hq"}
      companyTabs={nav.companyTabs}
      dashboardLabel={nav.dashboardLabel}
      identity={identity}
    >
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
        <h1 className="text-lg font-semibold text-fg">Dashboard</h1>
        <div className="mt-4 rounded border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          {admin.role === "hq"
            ? "No BA Tool reports have been uploaded yet. Go to Upload to add today's file."
            : "No BA Tool reports have been uploaded yet — check back once HQ uploads a day's data."}
        </div>
      </div>
    );
  }

  // Branch admin, date not published yet → raw single-branch report instead
  // of the company-wide dashboard. Once HQ publishes, this branch gets the
  // full dashboard (see loadDashboardData's showBranchDailyReport).
  if (data.showBranchDailyReport) {
    const branchReport = data.filteredBranches[0];
    if (!data.report || !branchReport) {
      return (
        <div className="p-6">
          <h1 className="text-lg font-semibold text-fg">Daily Report</h1>
          <div className="mt-4 rounded border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
            Your uploads are saved. This report fills in once HQ has uploaded the day&apos;s BA Tool file.
          </div>
        </div>
      );
    }
    const uploadedAtLabel = new Date(data.report.uploadedAt).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
    return (
      <BranchDailyReport
        report={branchReport}
        branch={branchReport.branch}
        date={data.date}
        dates={data.dates}
        uploadedAtLabel={uploadedAtLabel}
        daysSincePrevious={data.report.daysSincePrevious}
      />
    );
  }

  const { date, region, dates, report, filteredBranches, kpis, hasPreviousUpload, monthSnapshots, serviceInfoMonthSnapshots, isPublished, canPublish, billTotals, isCompanyScope } =
    data;

  if (!report) {
    return (
      <div className="p-6">
        <div className="rounded border border-bad/30 bg-bad-soft p-4 text-sm text-bad">Could not load the report for {date}.</div>
      </div>
    );
  }

  const allKpis = computeKpiSummary(report.branches);
  const heroSummary = computeHeroSummary(filteredBranches);

  const trendSeriesByMetric = { vas: computeVasTrendSeries(monthSnapshots, serviceInfoMonthSnapshots, region) };
  const pace = {
    vas: computePace(date, kpis.vasAchievementForTheMonth, kpis.vasBillTarget),
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
        isCompanyScope={isCompanyScope}
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
          value={formatCompactCurrency(
            heroSummary.gusPartsMtd !== null && heroSummary.gusLabourMtd !== null
              ? heroSummary.gusPartsMtd + heroSummary.gusLabourMtd
              : null,
          )}
          sub={`${formatNumber(kpis.gusRoMtd)} ROs`}
          hasPreviousUpload={hasPreviousUpload}
        />
        <RichKpiCard
          icon={<WrenchIcon />}
          color="blue"
          label="BPU RO — MTD"
          value={formatCompactCurrency(
            heroSummary.bpuPartsMtd !== null && heroSummary.bpuLabourMtd !== null
              ? heroSummary.bpuPartsMtd + heroSummary.bpuLabourMtd
              : null,
          )}
          sub={`${formatNumber(kpis.bpuRoMtd)} ROs`}
          hasPreviousUpload={hasPreviousUpload}
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

      {billTotals.length > 0 && (
        <div className="mt-4">
          <CollapsibleCard title="Bills — Taxable Value" defaultOpen>
            <div className="space-y-2 p-3">
              {billTotals.map((bt) => (
                <BillDrilldown
                  key={bt.month}
                  month={bt.month}
                  total={bt.total}
                  count={bt.count}
                  scrapTotal={bt.scrapTotal}
                  usedOilTotal={bt.usedOilTotal}
                  untaggedTotal={bt.untaggedTotal}
                />
              ))}
            </div>
          </CollapsibleCard>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-fg-faint">
        <span>Data as of: {uploadedAtLabel} IST</span>
        <span>Figures rounded for display · full precision on hover</span>
      </div>
    </div>
  );
}
