import { Suspense } from "react";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel } from "@/lib/admin-store";
import { achievementRatio } from "@/lib/aggregate";
import { computePace } from "@/lib/pace";
import { isBodyPaintOnly, type BranchReport } from "@/lib/report";
import { loadVpData } from "@/lib/vp-data";
import { rankValues } from "@/lib/gus-per-car-trend";
import { countAwaitingVp, listVpQueryThreadsForVp } from "@/lib/vp-flags/store";
import { LABOUR_PER_RO_BANDS, PARTS_PER_RO_BANDS, TGLOSS_PER_RO_BANDS, RevenuePerVehicleTable } from "../dashboard/revenue-per-vehicle-table";
import { FlagComposer } from "./flag-composer";
import { GusPerCarCell } from "./gus-per-car-cell";
import { softBandClassName } from "./vp-band-colors";
import { VpBranchSlabTable } from "./vp-branch-slab-table";
import { VpBranchLabel, VpCompareProvider } from "./vp-compare";
import { buildCompareData } from "./vp-compare-data";
import { VpTkmMonthlyTable } from "./vp-tkm-monthly-table";
import { loadVpTkmQuarterly, quarterMonthsFor } from "./vp-tkm-quarterly";
import { VpTkmQuarterlyTable } from "./vp-tkm-quarterly-table";
import { requireVpAccess } from "./vp-guard";
import { RevenueStreamGrid } from "./revenue-stream-grid";
import { VpCollapsibleSection } from "./vp-collapsible-section";
import { VpExceptionsBanner } from "./vp-exceptions-banner";
import { VpHeader } from "./vp-header";
import { VpKpiCards } from "./vp-kpi-cards";
import { VpQueriesPopup } from "./vp-queries-popup";
import { VpShell } from "./vp-shell";
import { DraftWarning } from "@/components/draft-warning";

/** Ranks every branch with a real GUS Parts/Car or Labour/Car figure this
 * month, for the click-to-detail modal (gus-per-car-cell.tsx). Body &
 * Paint-only branches never have a GUS figure at all, so they're excluded
 * from the pool the same way they're excluded from this table's rows. */
function rankGusPerCar(branches: BranchReport[], value: (b: BranchReport) => number | null) {
  const rows = branches
    .map((b) => ({ branch: b.branch, value: value(b) }))
    .filter((r): r is { branch: string; value: number } => r.value !== null);
  return rankValues(rows);
}

export default async function VpOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; region?: string; flag?: string; fmetric?: string; fvalue?: string }>;
}) {
  const admin = await requireVpAccess();

  return (
    <VpShell identity={adminIdentityLabel(admin)}>
      <Suspense fallback={<DashboardPageSkeleton heroCards={5} />}>
        <Overview searchParams={searchParams} vpUsername={admin.username} />
      </Suspense>
    </VpShell>
  );
}

async function Overview({
  searchParams,
  vpUsername,
}: {
  searchParams: Promise<{ date?: string; region?: string; flag?: string; fmetric?: string; fvalue?: string }>;
  vpUsername: string;
}) {
  const params = await searchParams;
  const [data, queryThreads, unreadCount] = await Promise.all([
    loadVpData(params.date),
    listVpQueryThreadsForVp(vpUsername),
    countAwaitingVp(vpUsername),
  ]);

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <VpHeader eyebrow="Nippon Group · Service" title="Executive Overview" flagHref="/vp?flag=1" />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
        <VpQueriesPopup threads={queryThreads} unreadCount={unreadCount} />
      </div>
    );
  }
  if (!data.report || !data.group) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <VpHeader eyebrow="Nippon Group · Service" title="Executive Overview" dates={data.dates} date={data.date} basePath="/vp" flagHref={`/vp?date=${data.date}&flag=1`} />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool report on file for {data.date}.
        </div>
        <VpQueriesPopup threads={queryThreads} unreadCount={unreadCount} />
      </div>
    );
  }

  const flagBase = `/vp?date=${data.date}`;
  const uploadedAtLabel = new Date(data.report.uploadedAt).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  // Regions section data (folded in from the former /vp/regions page, 2026-09-26 — see revenue-per-vehicle-table.tsx).
  const generalBranches = data.report.branches.filter((b) => !isBodyPaintOnly(b.branch));
  const partsRank = rankGusPerCar(generalBranches, (b) => (b.gusRoMtd === null || b.gusRoMtd === 0 ? null : achievementRatio(b.gusPartsMtd, b.gusRoMtd)));
  const labourRank = rankGusPerCar(generalBranches, (b) => (b.gusRoMtd === null || b.gusRoMtd === 0 ? null : achievementRatio(b.gusLabourMtd, b.gusRoMtd)));
  const bpuRank = rankGusPerCar(generalBranches, (b) =>
    b.bpuRoMtd === null || b.bpuRoMtd === 0 || (b.bpuPartsMtd === null && b.bpuLabourMtd === null)
      ? null
      : achievementRatio((b.bpuPartsMtd ?? 0) + (b.bpuLabourMtd ?? 0), b.bpuRoMtd)
  );
  const tglossRank = rankGusPerCar(generalBranches, (b) => (b.gusRoMtd === null || b.gusRoMtd === 0 ? null : achievementRatio(b.vasAchievementForTheMonth, b.gusRoMtd)));

  const compareData = buildCompareData(data.report.branches, data.incentiveSlabTargetsByBranch);
  const tkmQuarterMonths = quarterMonthsFor(data.date);
  const tkmQuarterlyScopes = await loadVpTkmQuarterly(data.date, data.report);

  return (
    <VpCompareProvider data={compareData}>
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      {!data.isPublished && (
        <DraftWarning uploadedBranches={data.uploadedBranchCount} totalBranches={data.totalBranchCount} />
      )}
      {/* Sticky under VpShell's own top bar (top-14 = its h-14) — the date
          picker, Raise a query and Export to PDF stay reachable while
          scrolling through the grid/Regions below, instead of requiring a
          scroll back to the top every time. */}
      <div className="sticky top-14 z-20 bg-canvas print:static">
        <VpHeader
          eyebrow="Nippon Group · Service"
          title="Executive Overview"
          subtitle="Company-wide Service daily report, month-to-date."
          dates={data.dates}
          date={data.date}
          basePath="/vp"
          flagHref={`${flagBase}&flag=1`}
          showPrint
          asOfLabel={uploadedAtLabel}
        />
      </div>

      <div className="mt-5">
        <VpKpiCards group={data.scopes[0]} date={data.date} previous={data.previousScope} previousDate={data.report.previousDate} />
      </div>

      <VpExceptionsBanner exceptions={data.tglossExceptions} />

      <div className="mt-5">
        <VpCollapsibleSection title="Full Revenue Stream Grid" subtitle="Group, Central, South, North — every metric">
          <RevenueStreamGrid scopes={data.scopes} branches={data.report.branches} date={data.date} />
        </VpCollapsibleSection>
      </div>

      {/* A plain heading, not another VpCollapsibleSection — RevenuePerVehicleTable's
          own cards already collapse/expand and scroll internally on their own;
          wrapping them in a second collapsible card just doubled the chrome
          (two headers, two borders) for one conceptual section. */}
      <div id="regions" className="mt-5 scroll-mt-5">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">Regions</h2>
          <span className="text-[11px] font-normal text-fg-faint">Every branch&apos;s revenue per vehicle — Central, South and North, month-to-date</span>
        </div>
        <RevenuePerVehicleTable
          branches={data.report.branches}
          variant="compact"
          renderBranchCell={(row) => <VpBranchLabel label={row.branch} />}
          renderGusCell={(row, metric, value, plain) => {
            if (row.branch === "All branches" || value === null) return plain();
            const rankPool = metric === "parts" ? partsRank : metric === "labour" ? labourRank : metric === "bpu" ? bpuRank : tglossRank;
            const rank = rankPool.get(row.branch) ?? null;
            const className =
              metric === "parts"
                ? softBandClassName(value, PARTS_PER_RO_BANDS)
                : metric === "labour"
                  ? softBandClassName(value, LABOUR_PER_RO_BANDS)
                  : metric === "tgloss"
                    ? softBandClassName(value, TGLOSS_PER_RO_BANDS)
                    : "bg-surface-2 text-fg"; // BPU has no fixed per-RO target yet
            const bpuSplit =
              metric === "bpu"
                ? { parts: achievementRatio(row.bpuPartsMtd, row.bpuRoMtd), labour: achievementRatio(row.bpuLabourMtd, row.bpuRoMtd) }
                : undefined;
            const tglossPace =
              metric === "tgloss"
                ? (() => {
                    const pace = computePace(data.date, row.vasAchievementForTheMonth, row.vasBillTarget);
                    return { target: row.vasBillTarget, gap: pace.gap, requiredRatePerDay: pace.requiredRatePerDay };
                  })()
                : undefined;
            return (
              <GusPerCarCell
                branch={row.branch}
                metric={metric}
                value={value}
                className={className}
                rank={rank}
                date={data.date}
                bpuSplit={bpuSplit}
                tglossPace={tglossPace}
              />
            );
          }}
        />
        <div className="mt-3">
          <VpBranchSlabTable branches={data.report.branches} group={data.scopes[0]} incentiveSlabTargets={data.incentiveSlabTargetsByBranch} />
        </div>
        <div className="mt-3">
          <VpTkmMonthlyTable branches={data.report.branches} />
        </div>
      </div>

      <div className="mt-5">
        <VpCollapsibleSection title="TKM Targets — Quarterly" subtitle="BPU, Offtake, Parts Retail, PM+OC — Group and every region, this quarter">
          <div className="p-3">
            <VpTkmQuarterlyTable scopes={tkmQuarterlyScopes} months={tkmQuarterMonths} />
          </div>
        </VpCollapsibleSection>
      </div>

      <FlagComposer page="overview" date={data.date} />
      <VpQueriesPopup threads={queryThreads} unreadCount={unreadCount} />
    </div>
    </VpCompareProvider>
  );
}
