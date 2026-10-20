import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel } from "@/lib/admin-store";
import { branchName } from "@/lib/branch-names";
import { loadCentralMetricTargetsView } from "@/lib/central-metric-targets/view-data";
import { loadNavState } from "@/lib/dashboard-data";
import { BODY_PAINT_ONLY_BRANCHES, buildReport, type BranchReport } from "@/lib/report";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";
import { REGIONS, type RegionName } from "@/lib/regions";
import { listSnapshotDates } from "@/lib/snapshot-store";
import { requireRegionalRmAccess } from "../region-guard";
import { DateSelect } from "../../date-select";
import { TkmTargetsSection } from "../../central/tkm-targets-section";

export default async function RegionTkmTargetsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const admin = await requireRegionalRmAccess();
  if (admin.role !== "regional") return null; // unreachable — the guard above already enforced this
  const identity = adminIdentityLabel(admin);
  const nav = await loadNavState(admin);

  return (
    <AppShell
      current="region-tkm-targets"
      showDashboardLink
      regionalRmNav
      dashboardLabel={nav.dashboardLabel}
      queriesBadge={nav.queriesBadge}
      identity={identity}
    >
      <Suspense fallback={<DashboardPageSkeleton heroCards={4} />}>
        <TkmTargetsContent region={admin.region} searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function TkmTargetsContent({ region, searchParams }: { region: RegionName; searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const dates = await listSnapshotDates();

  if (dates.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <h1 className="text-lg font-semibold text-fg">TKM Targets</h1>
        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet — check back once HQ uploads a day&apos;s data.
        </div>
      </div>
    );
  }

  const date = params.date && dates.includes(params.date) ? params.date : dates.at(-1)!;
  const [report, holidays] = await Promise.all([buildReport(date), loadReportHolidaySet()]);

  if (!report) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <h1 className="text-lg font-semibold text-fg">TKM Targets</h1>
        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          No BA Tool report on file for {date}.
        </div>
      </div>
    );
  }

  // Same exclusion Central applies to CO01E — a Body & Paint-only branch has
  // no general-service business, so none of these 7 metrics mean anything
  // for it (it never gets its own TKM target row).
  const metricBranches = REGIONS[region].filter((b) => !BODY_PAINT_ONLY_BRANCHES.has(b));
  const branches = metricBranches
    .map((code) => report.branches.find((b) => b.branch === code))
    .filter((b): b is BranchReport => b !== undefined);
  // baToolFallback: true (2026-10-20) — unlike Central, South/North RMs don't
  // hand-maintain central_metric_targets, so any branch with nothing manually
  // set this month falls back to BA Tool's own live target field for whichever
  // of the 6 metrics has one; SPR External always stays blank, since BA Tool
  // has no target field for it at all. See view-data.ts's own comment.
  const metrics = await loadCentralMetricTargetsView(branches, date, holidays, undefined, { baToolFallback: true });
  const branchLabels = Object.fromEntries(metricBranches.map((code) => [code, branchName(code)]));

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">TKM Targets</h1>
          <p className="mt-1 text-xs text-fg-faint">
            Month-to-date and full-year pace for BPU, Offtake, SPR Internal, SPR External, PM+OC, Battery, and Tyre —
            {region}&apos;s branches.
          </p>
        </div>
        <DateSelect dates={dates} selected={date} region="All" basePath="/dashboard/region/tkm-targets" />
      </div>

      <div className="mt-4">
        <TkmTargetsSection metrics={metrics} branchLabels={branchLabels} />
      </div>
    </div>
  );
}
