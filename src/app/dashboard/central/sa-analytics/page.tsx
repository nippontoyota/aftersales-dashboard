import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel } from "@/lib/admin-store";
import { loadNavState } from "@/lib/dashboard-data";
import { requireCentralRmAccess } from "../central-guard";
import { RegionSaAnalyticsContent } from "../../region-sa-analytics-content";

export default async function CentralSaAnalyticsPage({ searchParams }: { searchParams: Promise<{ date?: string; saBranch?: string }> }) {
  const admin = await requireCentralRmAccess();
  const identity = adminIdentityLabel(admin);
  const nav = await loadNavState(admin);

  return (
    <AppShell
      current="central-sa-analytics"
      showDashboardLink
      centralNav
      dashboardLabel={nav.dashboardLabel}
      queriesBadge={nav.queriesBadge}
      identity={identity}
    >
      <Suspense fallback={<DashboardPageSkeleton heroCards={4} />}>
        <RegionSaAnalyticsContent region="Central" searchParams={searchParams} basePath="/dashboard/central/sa-analytics" />
      </Suspense>
    </AppShell>
  );
}
