import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel, type AdminAccount } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadDashboardData, loadNavState } from "@/lib/dashboard-data";
import { NoDataForDate } from "@/components/no-data-for-date";
import { SaAnalyticsSections } from "@/components/sa-analytics-sections";
import { SaBranchSelect } from "@/components/sa-branch-select";
import { aggregateCloseSaRows, mergeRepeatJobCounts } from "@/lib/close-sa-analytics/aggregate";
import { findRepeatJobs, repeatJobCountsBySa } from "@/lib/close-sa-analytics/repeat-jobs";
import { loadCloseSaAnalyticsForAllBranches } from "@/lib/close-sa-analytics/store";
import { listAllAccessoriesStaff } from "@/lib/accessories-staff-store";
import { BranchPerformanceHeatmap } from "../dashboard/branch-performance-heatmap";
import { RevenuePerVehicleTable } from "../dashboard/revenue-per-vehicle-table";
import { StockServiceRateTable } from "../dashboard/stock-service-rate-table";

export default async function BranchesPage({ searchParams }: { searchParams: Promise<{ date?: string; region?: string; saBranch?: string }> }) {
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
    <AppShell current="branches" showDashboardLink isHq={admin.role === "hq"} companyTabs={nav.companyTabs} canUpload={nav.canUpload} queriesBadge={nav.queriesBadge} identity={identity}>
      <Suspense fallback={<DashboardPageSkeleton />}>
        <BranchesContent searchParams={searchParams} admin={admin} />
      </Suspense>
    </AppShell>
  );
}

async function BranchesContent({
  searchParams,
  admin,
}: {
  searchParams: Promise<{ date?: string; region?: string; saBranch?: string }>;
  admin: AdminAccount;
}) {
  const params = await searchParams;
  const data = await loadDashboardData(params, admin);

  if (!data) {
    return (
      <div className="mx-auto max-w-[1600px] p-6">
        <h1 className="text-lg font-semibold text-fg">Branch Performance</h1>
        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
      </div>
    );
  }
  if (!data.report) {
    return <NoDataForDate title="Branch Performance" date={data.date} dates={data.dates} basePath="/branches" />;
  }

  const monthStart = `${data.date.slice(0, 7)}-01`;
  const [closeSaRows, allAccessoriesStaff] = await Promise.all([
    loadCloseSaAnalyticsForAllBranches(monthStart, data.date),
    listAllAccessoriesStaff(),
  ]);
  const closeSaTotalsAll = aggregateCloseSaRows(closeSaRows);

  // SA Analytics' own branch filter (2026-10-24, at the user's request) —
  // deliberately separate from the page's region selector above, which never
  // touched SA Analytics (always showed all 18 branches' SAs together).
  const saBranch = params.saBranch && params.saBranch !== "All" ? params.saBranch : null;
  const closeSaTotals = saBranch ? closeSaTotalsAll.filter((t) => t.branches[0] === saBranch) : closeSaTotalsAll;

  const accessoriesStaffNamesByBranch = new Map<string, string[]>();
  for (const s of allAccessoriesStaff) {
    if (!accessoriesStaffNamesByBranch.has(s.branch)) accessoriesStaffNamesByBranch.set(s.branch, []);
    accessoriesStaffNamesByBranch.get(s.branch)!.push(s.name);
  }

  // Same Car Same Work Repeat is a live cross-date check, not part of the
  // daily snapshot (see repeat-jobs.ts) — one query per branch actually
  // involved this period (and now, actually displayed — filtering saBranch
  // first means a single-branch selection only queries that one branch).
  const branchesInvolved = [...new Set(closeSaTotals.flatMap((t) => t.branches))];
  const repeatFlagsByBranch = await Promise.all(branchesInvolved.map((b) => findRepeatJobs(b, monthStart, data.date)));
  const repeatCounts = repeatJobCountsBySa(repeatFlagsByBranch.flat());
  mergeRepeatJobCounts(closeSaTotals, repeatCounts);

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      <DashboardPageHeader
        title="Branch Performance"
        basePath="/branches"
        date={data.date}
        region={data.region}
        dates={data.dates}
        branchCount={data.filteredBranches.length}
        hasPreviousUpload={data.hasPreviousUpload}
        previousDate={data.report?.previousDate ?? null}
        daysSincePrevious={data.report?.daysSincePrevious ?? null}
        isPublished={data.isPublished}
        canPublish={data.canPublish}
        isCompanyScope={data.isCompanyScope}
      />
      <div className="mt-4 space-y-4">
        <RevenuePerVehicleTable branches={data.filteredBranches} />
        <StockServiceRateTable branches={data.filteredBranches} />
        <BranchPerformanceHeatmap branches={data.filteredBranches} collapsible />
        <div className="flex items-center justify-end gap-2 text-xs text-fg-subtle">
          <span>SA Analytics branch:</span>
          <SaBranchSelect
            selected={saBranch ?? "All"}
            date={data.date}
            basePath="/branches"
            extraParams={data.region !== "All" ? { region: data.region } : undefined}
            branches={data.report.branches.map((b) => b.branch)}
          />
        </div>
        <SaAnalyticsSections
          totals={closeSaTotals}
          accessoriesStaffNamesByBranch={accessoriesStaffNamesByBranch}
          showBranch={!saBranch}
          subtitlePrefix={`Month-to-date for ${data.date}, ${saBranch ?? "company-wide"}`}
        />
      </div>
    </div>
  );
}
