import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel, type AdminAccount } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadDashboardData, loadNavState } from "@/lib/dashboard-data";
import { NoDataForDate } from "@/components/no-data-for-date";
import { CancellationFlag } from "../cancellations/cancellation-flag";
import { VpFlagsPanel } from "@/components/vp-flags-panel";

/** Formerly "Alerts" — the achievement-below-target list (AlertsPanel) was
 * dropped entirely (2026-09-15, at the user's request: "not really needed").
 * What's left is VP Service's flag-to-HQ inbox (VpFlagsPanel) plus the
 * Cancellations flag — genuinely different from a below-target alert, so the
 * page keeps a home even though the achievement-alerts feature is gone. */
export default async function QueriesPage({ searchParams }: { searchParams: Promise<{ date?: string; region?: string }> }) {
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
    <AppShell current="queries" showDashboardLink isHq={admin.role === "hq"} companyTabs={nav.companyTabs} canUpload={nav.canUpload} identity={identity}>
      <Suspense fallback={<DashboardPageSkeleton />}>
        <QueriesContent searchParams={searchParams} admin={admin} />
      </Suspense>
    </AppShell>
  );
}

async function QueriesContent({
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
        <h1 className="text-lg font-semibold text-fg">Queries</h1>
        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
      </div>
    );
  }
  if (!data.report) {
    return <NoDataForDate title="Queries" date={data.date} dates={data.dates} basePath="/queries" />;
  }

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      <DashboardPageHeader
        title="Queries"
        basePath="/queries"
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
      <Suspense fallback={null}>
        <CancellationFlag admin={admin} />
      </Suspense>
      <Suspense fallback={null}>
        <VpFlagsPanel admin={admin} />
      </Suspense>
    </div>
  );
}
