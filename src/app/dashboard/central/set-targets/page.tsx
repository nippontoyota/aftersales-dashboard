import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel } from "@/lib/admin-store";
import { CENTRAL_BRANCH_LABELS, centralBranchesForMonth } from "@/lib/central-region-data";
import { loadCentralMetricTargets } from "@/lib/central-metric-targets/store";
import { CENTRAL_METRICS, type CentralMetricKey } from "@/lib/central-metric-targets/metrics";
import { targetFor } from "@/lib/central-metric-targets/view-data";
import { loadNavState } from "@/lib/dashboard-data";
import { loadRegionRevenueTargets } from "@/lib/region-targets/store";
import { listSnapshotDates } from "@/lib/snapshot-store";
import { requireCentralRmAccess } from "../central-guard";
import { DateSelect } from "../../date-select";
import { TargetsForm } from "../targets-form";
import { TkmTargetsForm } from "../tkm-targets-form";

const CENTRAL_METRIC_BRANCHES = ["CO01A", "CO01B", "MV01A", "KY01A"];

export default async function CentralSetTargetsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const admin = await requireCentralRmAccess();
  const identity = adminIdentityLabel(admin);
  const nav = await loadNavState(admin);

  return (
    <AppShell
      current="central-set-targets"
      showDashboardLink
      centralNav
      dashboardLabel={nav.dashboardLabel}
      queriesBadge={nav.queriesBadge}
      identity={identity}
    >
      <Suspense fallback={<DashboardPageSkeleton heroCards={0} />}>
        <SetTargetsContent searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function SetTargetsContent({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const dates = await listSnapshotDates();
  const date = params.date && dates.includes(params.date) ? params.date : dates.at(-1) ?? new Date().toISOString().slice(0, 10);
  const month = date.slice(0, 7);

  const gsBranches = centralBranchesForMonth(month);
  const tkmBranches = CENTRAL_METRIC_BRANCHES;

  const [regionTargets, tkmTargets] = await Promise.all([
    loadRegionRevenueTargets(month, gsBranches),
    loadCentralMetricTargets(month, tkmBranches),
  ]);

  const tkmCurrentTargets: Record<string, Record<CentralMetricKey, number | null>> = {};
  for (const branch of tkmBranches) {
    const targets = {} as Record<CentralMetricKey, number | null>;
    const stored = tkmTargets.get(branch);
    for (const metric of CENTRAL_METRICS) targets[metric.key] = targetFor(stored, metric.key);
    tkmCurrentTargets[branch] = targets;
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Set Targets</h1>
          <p className="mt-1 text-xs text-fg-faint">Every monthly target the Central region tracks, in one place — pick a month, then edit and save.</p>
        </div>
        <DateSelect dates={dates} selected={date} region="All" basePath="/dashboard/central/set-targets" />
      </div>

      <div className="mt-4 space-y-4">
        <TargetsForm
          month={month}
          branches={gsBranches.map((branch) => ({
            branch,
            label: CENTRAL_BRANCH_LABELS[branch],
            gsTarget: regionTargets.get(branch)?.gsTarget ?? null,
            bpTarget: regionTargets.get(branch)?.bpTarget ?? null,
            extTarget: regionTargets.get(branch)?.extTarget ?? null,
          }))}
        />

        <TkmTargetsForm month={month} branches={tkmBranches} currentTargets={tkmCurrentTargets} />
      </div>
    </div>
  );
}
