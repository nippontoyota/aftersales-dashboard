import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel, type AdminAccount } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadDashboardData, loadNavState } from "@/lib/dashboard-data";
import { ReportTable } from "../dashboard/report-table";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ date?: string; region?: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin?.canViewDashboard) redirect("/upload");
  // Company-wide pages are hidden from a branch admin until their latest
  // date is published — before that they only get the Daily Report.
  const nav = await loadNavState(admin);
  if (!nav.companyTabs) redirect("/dashboard");
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

  if (!data || !data.report) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold text-fg">Reports</h1>
        <div className="mt-4 rounded border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          {admin.role === "hq" ? "No BA Tool reports have been uploaded yet." : "No BA Tool reports have been uploaded yet — check back once HQ uploads a day's data."}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
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
