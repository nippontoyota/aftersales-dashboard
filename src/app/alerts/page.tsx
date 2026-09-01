import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import type { AdminAccount } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadDashboardData } from "@/lib/dashboard-data";
import { AlertsPanel, TKM_WATCHED } from "../dashboard/alerts-panel";

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ date?: string; region?: string; watched?: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin?.canViewDashboard) redirect("/upload");
  // Full company-wide access for everyone (2026-08-29 branch-lock reversed
  // 2026-08-31, at the user's request) — gated only by publish status,
  // enforced inside loadDashboardData, not by role here.
  const identity = admin.role === "hq" ? "HQ admin" : `${admin.branch} branch`;

  return (
    <AppShell current="alerts" showDashboardLink isHq={admin.role === "hq"} identity={identity}>
      <Suspense fallback={<DashboardPageSkeleton />}>
        <AlertsContent searchParams={searchParams} admin={admin} />
      </Suspense>
    </AppShell>
  );
}

async function AlertsContent({
  searchParams,
  admin,
}: {
  searchParams: Promise<{ date?: string; region?: string; watched?: string }>;
  admin: AdminAccount;
}) {
  const params = await searchParams;
  const data = await loadDashboardData(params, admin);
  // Defaults to VAS (the main Dashboard's own alerts) — TKM Targets' "View
  // all" links here with ?watched=tkm so the full page counts the same
  // BPU/Offtake/Parts Retail/PM+OC alerts its preview just showed, instead
  // of silently falling back to a different metric set (found 2026-09-01).
  const isTkm = params.watched === "tkm";

  if (!data) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold text-slate-900">Alerts</h1>
        <div className="mt-4 rounded border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          {admin.role === "hq" ? "No BA Tool reports have been uploaded yet." : "Nothing has been published yet — check back once HQ publishes a day's dashboard."}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <DashboardPageHeader
        title="Alerts"
        basePath="/alerts"
        date={data.date}
        region={data.region}
        dates={data.dates}
        branchCount={data.filteredBranches.length}
        hasPreviousUpload={data.hasPreviousUpload}
        previousDate={data.report?.previousDate ?? null}
        daysSincePrevious={data.report?.daysSincePrevious ?? null}
        isPublished={data.isPublished}
        canPublish={data.canPublish}
        extraParams={isTkm ? { watched: "tkm" } : undefined}
      />
      <p className="mt-1 text-xs text-slate-400">Watching: {isTkm ? "BPU, Offtake, Parts Retail, PM+OC (TKM Targets)" : "VAS (Dashboard)"}</p>
      <div className="mt-4">
        <AlertsPanel branches={data.filteredBranches} variant="full" watched={isTkm ? TKM_WATCHED : undefined} />
      </div>
    </div>
  );
}
