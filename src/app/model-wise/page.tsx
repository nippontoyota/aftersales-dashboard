import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { tglossText } from "@/components/tgloss-text";
import { adminIdentityLabel, type AdminAccount } from "@/lib/admin-store";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";
import { latestNonHolidayDate } from "@/lib/reporting-date";
import { listSnapshotDates } from "@/lib/snapshot-store";
import { loadModelWiseReport } from "@/lib/model-wise/load";
import { VEHICLE_BRANDS, type VehicleBrand } from "@/lib/model-wise/brand";
import type { ModelWiseBranchResult } from "@/lib/model-wise/compute";
import { ModelWiseHeader } from "./model-wise-header";
import { modelWiseScopeBranches, requireModelWiseAccess } from "./model-wise-guard";
import { ItemBrandTable, PartsLabourBrandTable, TglossBrandTable, type ItemRow, type PartsLabourRow, type TglossRow } from "./model-wise-tables";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function emptyBrandRecord<T>(make: () => T): Record<VehicleBrand, T> {
  return { toyota: make(), alliance: make(), lexus: make() };
}

function combinedFigures(branch: ModelWiseBranchResult): Record<VehicleBrand, { ros: number; parts: number; labour: number }> {
  const out = emptyBrandRecord(() => ({ ros: 0, parts: 0, labour: 0 }));
  for (const b of VEHICLE_BRANDS) {
    out[b] = {
      ros: branch.gusRos[b] + branch.bpRos[b],
      parts: branch.gus[b].parts + branch.bp[b].parts,
      labour: branch.gus[b].labour + branch.bp[b].labour,
    };
  }
  return out;
}

export default async function ModelWisePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const admin = await requireModelWiseAccess();
  const identity = adminIdentityLabel(admin);

  if (admin.role === "vp_service") {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-6 py-8">
        <Link href="/vp" className="mb-3 inline-flex items-center gap-1 text-[12px] font-medium text-fg-subtle hover:text-accent-text print:hidden">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Executive Overview
        </Link>
        <Suspense fallback={<DashboardPageSkeleton />}>
          <ModelWiseContent searchParams={searchParams} admin={admin} />
        </Suspense>
      </div>
    );
  }

  return (
    <AppShell
      current="model-wise"
      showDashboardLink
      isHq={admin.role === "hq"}
      isRegional={admin.role === "regional"}
      isBranch={admin.role === "branch"}
      // Same role-based derivation loadNavState() uses for the real
      // dashboard — without it, a branch admin here would see the
      // full company-wide nav (Branch Performance/Reports/TKM Targets)
      // instead of their usual restricted one.
      slimNav={admin.role === "branch" || admin.role === "regional"}
      centralNav={admin.role === "regional" && admin.region === "Central"}
      regionalRmNav={admin.role === "regional" && admin.region !== "Central"}
      identity={identity}
    >
      <Suspense fallback={<DashboardPageSkeleton />}>
        <ModelWiseContent searchParams={searchParams} admin={admin} />
      </Suspense>
    </AppShell>
  );
}

async function ModelWiseContent({
  searchParams,
  admin,
}: {
  searchParams: Promise<{ date?: string }>;
  admin: AdminAccount;
}) {
  const params = await searchParams;
  const [allDates, holidays] = await Promise.all([listSnapshotDates(), loadReportHolidaySet()]);

  if (allDates.length === 0) {
    return <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">No reports have been uploaded yet.</div>;
  }

  const date = params.date && DATE_RE.test(params.date) ? params.date : latestNonHolidayDate(allDates, holidays)!;
  const scopeBranches = modelWiseScopeBranches(admin);

  const report = await loadModelWiseReport(date, scopeBranches ?? undefined);

  if (!report || report.branches.length === 0) {
    return (
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <ModelWiseHeader
          title="Model-wise Revenue Split"
          subtitle="Toyota · Alliance · Lexus"
          dates={allDates}
          date={date}
          downloadHref={`/api/model-wise/export?date=${date}`}
        />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool report on file for {date}.
        </div>
      </div>
    );
  }

  const combinedRows: PartsLabourRow[] = report.branches.map((b) => ({ branch: b.branch, byBrand: combinedFigures(b) }));
  const combinedTotal = combinedFigures({
    branch: "",
    gusRos: report.company.gusRos,
    bpRos: report.company.bpRos,
    gus: report.company.gus,
    bp: report.company.bp,
    tgloss: report.company.tgloss,
    items: report.company.items,
    unclassifiedGus: report.company.unclassifiedGus,
    unclassifiedBp: report.company.unclassifiedBp,
  });

  const gusRows: PartsLabourRow[] = report.branches
    .filter((b) => VEHICLE_BRANDS.some((brand) => b.gusRos[brand] > 0))
    .map((b) => ({ branch: b.branch, byBrand: { toyota: { ...b.gus.toyota, ros: b.gusRos.toyota }, alliance: { ...b.gus.alliance, ros: b.gusRos.alliance }, lexus: { ...b.gus.lexus, ros: b.gusRos.lexus } } }));
  const gusTotal = { toyota: { ...report.company.gus.toyota, ros: report.company.gusRos.toyota }, alliance: { ...report.company.gus.alliance, ros: report.company.gusRos.alliance }, lexus: { ...report.company.gus.lexus, ros: report.company.gusRos.lexus } };

  const bpRows: PartsLabourRow[] = report.branches.map((b) => ({
    branch: b.branch,
    byBrand: { toyota: { ...b.bp.toyota, ros: b.bpRos.toyota }, alliance: { ...b.bp.alliance, ros: b.bpRos.alliance }, lexus: { ...b.bp.lexus, ros: b.bpRos.lexus } },
  }));
  const bpTotal = { toyota: { ...report.company.bp.toyota, ros: report.company.bpRos.toyota }, alliance: { ...report.company.bp.alliance, ros: report.company.bpRos.alliance }, lexus: { ...report.company.bp.lexus, ros: report.company.bpRos.lexus } };

  const tglossRows: TglossRow[] = report.branches.map((b) => ({ branch: b.branch, byBrand: b.tgloss }));

  const itemSections: { key: "injectorCleaner" | "engineFlush" | "tyre" | "battery"; title: string }[] = [
    { key: "injectorCleaner", title: "Injector Cleaner" },
    { key: "engineFlush", title: "Engine Flush" },
    { key: "tyre", title: "Tyre" },
    { key: "battery", title: "Battery" },
  ];

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-8">
      <ModelWiseHeader
        title="Model-wise Revenue Split"
        subtitle="Toyota · Alliance · Lexus — General Service + Body &amp; Paint, month-to-date, reconciled to the official GUS/BPU Parts &amp; Labour MTD totals."
        dates={allDates}
        date={date}
        downloadHref={`/api/model-wise/export?date=${date}`}
      />

      <div className="mt-6 space-y-8">
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">GUS + BP Combined</h2>
          <PartsLabourBrandTable title="Branch" rows={combinedRows} total={combinedTotal} />
        </section>

        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">GUS (General Service)</h2>
          <PartsLabourBrandTable title="Branch" rows={gusRows} total={gusTotal} />
        </section>

        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">BP (Body &amp; Paint)</h2>
          <PartsLabourBrandTable title="Branch" rows={bpRows} total={bpTotal} />
        </section>

        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{tglossText("TGLOSS Revenue")}</h2>
          <TglossBrandTable rows={tglossRows} total={report.company.tgloss} />
        </section>

        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">Injector Cleaner · Engine Flush · Tyre · Battery</h2>
          <div className="space-y-5">
            {itemSections.map((section) => {
              const countKey = `${section.key}Count` as const;
              const revenueKey = `${section.key}Revenue` as const;
              const rows: ItemRow[] = report.branches.map((b) => ({
                branch: b.branch,
                byBrand: emptyBrandRecord(() => ({ count: 0, revenue: 0 })),
              }));
              for (const row of rows) {
                const branch = report.branches.find((b) => b.branch === row.branch)!;
                for (const brand of VEHICLE_BRANDS) {
                  row.byBrand[brand] = { count: branch.items[brand][countKey], revenue: branch.items[brand][revenueKey] };
                }
              }
              const total = emptyBrandRecord(() => ({ count: 0, revenue: 0 }));
              for (const brand of VEHICLE_BRANDS) {
                total[brand] = { count: report.company.items[brand][countKey], revenue: report.company.items[brand][revenueKey] };
              }
              return <ItemBrandTable key={section.key} title={section.title} rows={rows} total={total} />;
            })}
          </div>
        </section>
      </div>

      <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-fg-faint">
        GUS/BP Parts &amp; Labour brand shares are computed from SSRV089 (Cost &amp; Sales) joined to Service Info&apos;s vehicle
        Series, then scaled so Toyota + Alliance + Lexus sum exactly to the official GUS/BPU Parts &amp; Labour MTD total shown
        elsewhere in the dashboard. {tglossText("TGLOSS")} revenue is exact (same Service Info × price-list match the rest of the
        dashboard uses). Injector Cleaner/Engine Flush/Tyre/Battery are best-available from the Part Sale Report, which only
        matches a repair order on ~65-85% of rows — not reconciled to any other total.
      </p>
    </div>
  );
}
