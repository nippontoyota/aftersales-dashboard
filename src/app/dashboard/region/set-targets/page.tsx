import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel } from "@/lib/admin-store";
import { branchName } from "@/lib/branch-names";
import { loadNavState } from "@/lib/dashboard-data";
import { loadRegionRevenueTargets } from "@/lib/region-targets/store";
import { REGIONS, type RegionName } from "@/lib/regions";
import { listSnapshotDates } from "@/lib/snapshot-store";
import { requireRegionalRmAccess } from "../region-guard";
import { DateSelect } from "../../date-select";
import { TargetsForm } from "../../central/targets-form";

export default async function RegionSetTargetsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const admin = await requireRegionalRmAccess();
  if (admin.role !== "regional") return null; // unreachable — the guard above already enforced this
  const identity = adminIdentityLabel(admin);
  const nav = await loadNavState(admin);

  return (
    <AppShell
      current="region-set-targets"
      showDashboardLink
      regionalRmNav
      dashboardLabel={nav.dashboardLabel}
      queriesBadge={nav.queriesBadge}
      identity={identity}
    >
      <Suspense fallback={<DashboardPageSkeleton heroCards={0} />}>
        <SetTargetsContent region={admin.region} searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function SetTargetsContent({ region, searchParams }: { region: RegionName; searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const dates = await listSnapshotDates();
  const date = params.date && dates.includes(params.date) ? params.date : dates.at(-1) ?? new Date().toISOString().slice(0, 10);
  const month = date.slice(0, 7);

  const branches: readonly string[] = REGIONS[region];
  const regionTargets = await loadRegionRevenueTargets(month, branches);

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Set Targets</h1>
          <p className="mt-1 text-xs text-fg-faint">This month&apos;s GS / BP / Ext Sales targets for {region} — pick a month, then edit and save.</p>
        </div>
        <DateSelect dates={dates} selected={date} region="All" basePath="/dashboard/region/set-targets" />
      </div>

      <div className="mt-4 space-y-4">
        <TargetsForm
          month={month}
          branches={branches.map((branch) => ({
            branch,
            label: branchName(branch),
            gsTarget: regionTargets.get(branch)?.gsTarget ?? null,
            bpTarget: regionTargets.get(branch)?.bpTarget ?? null,
            extTarget: regionTargets.get(branch)?.extTarget ?? null,
          }))}
        />
      </div>
    </div>
  );
}
