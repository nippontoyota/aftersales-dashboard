import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel } from "@/lib/admin-store";
import { loadCentralMetricTargetsView } from "@/lib/central-metric-targets/view-data";
import { loadNavState } from "@/lib/dashboard-data";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";
import { buildReport, type BranchReport } from "@/lib/report";
import { listSnapshotDates } from "@/lib/snapshot-store";
import { requireCentralRmAccess } from "../central-guard";
import { DateSelect } from "../../date-select";
import { TkmTargetsSection } from "../tkm-targets-section";

const CENTRAL_METRIC_BRANCHES = ["CO01A", "CO01B", "MV01A", "KY01A"];

export default async function CentralTkmTargetsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const admin = await requireCentralRmAccess();
  const identity = adminIdentityLabel(admin);
  const nav = await loadNavState(admin);

  return (
    <AppShell
      current="central-tkm-targets"
      showDashboardLink
      centralNav
      dashboardLabel={nav.dashboardLabel}
      queriesBadge={nav.queriesBadge}
      identity={identity}
    >
      <Suspense fallback={<DashboardPageSkeleton heroCards={4} />}>
        <TkmTargetsContent searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function TkmTargetsContent({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
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

  // Follow CENTRAL_METRIC_BRANCHES's own order (Muvattupuzha before
  // Kayamkulam), not report.branches's alphabetical order — keeps this page
  // uniform with the RM dashboard and Set Targets, which both already show
  // Muvattupuzha first.
  const branches = CENTRAL_METRIC_BRANCHES.map((code) => report.branches.find((b) => b.branch === code)).filter(
    (b): b is BranchReport => b !== undefined,
  );
  const co01eReport = report.branches.find((b) => b.branch === "CO01E");
  const metrics = await loadCentralMetricTargetsView(branches, date, holidays, co01eReport);

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">TKM Targets</h1>
          <p className="mt-1 text-xs text-fg-faint">
            Month-to-date and full-year pace for BPU, Offtake, SPR Internal, SPR External, PM+OC, Battery, and Tyre —
            Central&apos;s 4 branches.
          </p>
        </div>
        <DateSelect dates={dates} selected={date} region="All" basePath="/dashboard/central/tkm-targets" />
      </div>

      <div className="mt-4">
        <TkmTargetsSection metrics={metrics} />
      </div>
    </div>
  );
}
