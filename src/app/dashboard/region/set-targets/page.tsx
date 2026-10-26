import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel } from "@/lib/admin-store";
import { branchName } from "@/lib/branch-names";
import { loadBaToolMetricTargets } from "@/lib/central-metric-targets/ba-tool-targets";
import { loadCentralMetricTargets } from "@/lib/central-metric-targets/store";
import { CENTRAL_METRICS, type CentralMetricKey } from "@/lib/central-metric-targets/metrics";
import { targetFor } from "@/lib/central-metric-targets/view-data";
import { loadNavState } from "@/lib/dashboard-data";
import { loadRegionRevenueTargets } from "@/lib/region-targets/store";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";
import { latestNonHolidayDate } from "@/lib/reporting-date";
import { REGIONS, type RegionName } from "@/lib/regions";
import { listSnapshotDates } from "@/lib/snapshot-store";
import { requireRegionalRmAccess } from "../region-guard";
import { DateSelect } from "../../date-select";
import { TargetsForm } from "../../central/targets-form";
import { TkmTargetsForm } from "../../central/tkm-targets-form";

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
  const [dates, holidaySet] = await Promise.all([listSnapshotDates(), loadReportHolidaySet()]);
  const date = params.date && dates.includes(params.date) ? params.date : latestNonHolidayDate(dates, holidaySet) ?? new Date().toISOString().slice(0, 10);
  const month = date.slice(0, 7);

  const branches: readonly string[] = REGIONS[region];
  // Unlike Central (which excludes CO01E), South/North's Body & Paint-only
  // branches get a TKM target row too (2026-10-20, at the RM's request) —
  // BPU itself is exactly their core business.
  const tkmBranches: string[] = [...branches];

  const [regionTargets, tkmTargets] = await Promise.all([
    loadRegionRevenueTargets(month, branches),
    loadCentralMetricTargets(month, tkmBranches),
  ]);

  // A branch with no manually-saved row at all falls back to BA Tool's own
  // live target field (2026-10-20) — South/North RMs don't hand-maintain
  // central_metric_targets the way Central's does, so this pre-fills the
  // form with whatever BA Tool already has instead of leaving it blank.
  // SPR External has no BA Tool target field, so it stays blank either way.
  // Once a branch's row is saved here, this fallback never applies to it
  // again (the saved row always wins).
  const tkmCurrentTargets: Record<string, Record<CentralMetricKey, number | null>> = {};
  await Promise.all(
    tkmBranches.map(async (branch) => {
      const stored = tkmTargets.get(branch);
      const baToolTargets = stored ? undefined : await loadBaToolMetricTargets(branch, date);
      const targets = {} as Record<CentralMetricKey, number | null>;
      for (const metric of CENTRAL_METRICS) {
        targets[metric.key] = stored ? targetFor(stored, metric.key) : baToolTargets![metric.key];
      }
      tkmCurrentTargets[branch] = targets;
    })
  );

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Set Targets</h1>
          <p className="mt-1 text-xs text-fg-faint">Every monthly target {region} tracks, in one place — pick a month, then edit and save.</p>
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

        <TkmTargetsForm month={month} branches={tkmBranches} currentTargets={tkmCurrentTargets} />
      </div>
    </div>
  );
}
