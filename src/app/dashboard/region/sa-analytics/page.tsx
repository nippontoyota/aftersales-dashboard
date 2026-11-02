import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel } from "@/lib/admin-store";
import { loadNavState } from "@/lib/dashboard-data";
import { requireRegionalRmAccess } from "../region-guard";
import { RegionSaAnalyticsContent } from "../../region-sa-analytics-content";

export default async function RegionSaAnalyticsPage({ searchParams }: { searchParams: Promise<{ date?: string; saBranch?: string }> }) {
  const admin = await requireRegionalRmAccess();
  if (admin.role !== "regional") return null; // unreachable — the guard above already enforced this
  const identity = adminIdentityLabel(admin);
  const nav = await loadNavState(admin);

  return (
    <AppShell
      current="region-sa-analytics"
      showDashboardLink
      regionalRmNav
      dashboardLabel={nav.dashboardLabel}
      queriesBadge={nav.queriesBadge}
      identity={identity}
    >
      <Suspense fallback={<DashboardPageSkeleton heroCards={4} />}>
        <RegionSaAnalyticsContent region={admin.region} searchParams={searchParams} basePath="/dashboard/region/sa-analytics" />
      </Suspense>
    </AppShell>
  );
}
