import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import type { AdminAccount } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadDashboardData } from "@/lib/dashboard-data";
import { ReportTable } from "../dashboard/report-table";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ date?: string; region?: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin?.canViewDashboard) redirect("/upload");
  // Full company-wide access for everyone (2026-08-29 branch-lock reversed
  // 2026-08-31, at the user's request) — gated only by publish status,
  // enforced inside loadDashboardData, not by role here.
  const identity = admin.role === "hq" ? "HQ admin" : `${admin.branch} branch`;

  return (
    <AppShell current="reports" showDashboardLink isHq={admin.role === "hq"} identity={identity}>
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
        <h1 className="text-lg font-semibold text-slate-900">Reports</h1>
        <div className="mt-4 rounded border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          {admin.role === "hq" ? "No BA Tool reports have been uploaded yet." : "Nothing has been published yet — check back once HQ publishes a day's dashboard."}
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
      />
      <div className="mt-4">
        <ReportTable branches={data.filteredBranches} daysSincePrevious={data.report.daysSincePrevious} />
      </div>
    </div>
  );
}
