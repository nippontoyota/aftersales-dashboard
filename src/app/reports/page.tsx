import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel, type AdminAccount } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadDashboardData, loadNavState } from "@/lib/dashboard-data";
import { NoDataForDate } from "@/components/no-data-for-date";
import { ReportTable } from "../dashboard/report-table";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ date?: string; region?: string }> }) {
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
  if (admin.role !== "hq") redirect("/dashboard");
  const identity = adminIdentityLabel(admin);

  return (
    <AppShell current="reports" showDashboardLink isHq={admin.role === "hq"} companyTabs={nav.companyTabs} canUpload={nav.canUpload} identity={identity}>
      <Suspense fallback={<DashboardPageSkeleton />}>
        <ReportsContent searchParams={searchParams} admin={admin} />
      </Suspense>
    </AppShell>
  );
}

async function ReportsContent({
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
        <h1 className="text-lg font-semibold text-fg">Reports</h1>
        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
      </div>
    );
  }
  if (!data.report) {
    return <NoDataForDate title="Reports" date={data.date} dates={data.dates} basePath="/reports" />;
  }

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      <DashboardPageHeader
        title="Reports"
        basePath="/reports"
        date={data.date}
        region={data.region}
        dates={data.dates}
        branchCount={data.filteredBranches.length}
        hasPreviousUpload={data.hasPreviousUpload}
        previousDate={data.report.previousDate}
        daysSincePrevious={data.report.daysSincePrevious}
        isPublished={data.isPublished}
        canPublish={data.canPublish}
        isCompanyScope={data.isCompanyScope}
      />
      <div className="mt-4">
        <ReportTable branches={data.filteredBranches} daysSincePrevious={data.report.daysSincePrevious} />
      </div>
    </div>
  );
}
