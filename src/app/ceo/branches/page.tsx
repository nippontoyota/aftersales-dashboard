import { Suspense } from "react";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { achievementTone } from "@/lib/aggregate";
import { adminIdentityLabel } from "@/lib/admin-store";
import { branchName } from "@/lib/branch-names";
import { loadCeoData } from "@/lib/ceo-data";
import type { RegionName } from "@/lib/regions";
import { CeoShell } from "../ceo-shell";
import { requireCeoAccess } from "../ceo-guard";
import { CeoHeader } from "../ceo-header";
import { BranchRow } from "./branch-row";

export default async function CeoBranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; region?: string }>;
}) {
  const admin = await requireCeoAccess();
  return (
    <CeoShell identity={adminIdentityLabel(admin)}>
      <Suspense fallback={<DashboardPageSkeleton />}>
        <Branches searchParams={searchParams} />
      </Suspense>
    </CeoShell>
  );
}

async function Branches({ searchParams }: { searchParams: Promise<{ date?: string; region?: string }> }) {
  const params = await searchParams;
  const data = await loadCeoData(params.date);

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <CeoHeader eyebrow="Nippon Group · Aftersales" title="Branches" backHref="/ceo" backLabel="Overview" />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
      </div>
    );
  }
  if (!data.report) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <CeoHeader
          eyebrow="Nippon Group · Aftersales"
          title="Branches"
          dates={data.dates}
          date={data.date}
          basePath="/ceo/branches"
          dateExtraParams={params.region ? { region: params.region } : undefined}
          backHref={`/ceo?date=${data.date}`}
          backLabel="Overview"
        />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool report on file for {data.date}.
        </div>
      </div>
    );
  }

  const region = (["North", "Central", "South"] as RegionName[]).find((r) => r === params.region);
  const rollup = region ? data.regions.find((r) => r.region === region) : null;
  if (!region || !rollup) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <CeoHeader eyebrow="Nippon Group · Aftersales" title="Branches" backHref="/ceo" backLabel="Overview" />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          Pick a region from the overview to see its branches.
        </div>
      </div>
    );
  }

  const rows = [...rollup.branches].sort((a, b) => {
    const av = a.gs?.utilizationPct ?? a.bp?.utilizationPct ?? 0;
    const bv = b.gs?.utilizationPct ?? b.bp?.utilizationPct ?? 0;
    return av - bv;
  });

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <CeoHeader
        eyebrow="Nippon Group · Aftersales"
        title={`${region} branches`}
        subtitle={`Ranked by bay utilization, worst first — ${rollup.branches.length} branches, ${data.workingDaysElapsed} working days elapsed this month.`}
        dates={data.dates}
        date={data.date}
        basePath="/ceo/branches"
        dateExtraParams={{ region }}
        backHref={`/ceo?date=${data.date}`}
        backLabel="Overview"
      />

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="[&>th]:border-b [&>th]:border-border">
              <th className="bg-surface py-2.5 pl-5 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-faint">Branch</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Revenue MTD</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Profit MTD</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">GS ROs</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">GS Utilization</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">GS Profit/RO</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">GS Revenue/RO</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">BP ROs</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">BP Utilization</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">BP Profit/RO</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">BP Revenue/RO</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Revenue/RO</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">GS Capacity</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">BP Capacity</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">GUS Split</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ branch, gs, bp, gusSplit }) => {
              const gsTone = achievementTone(gs?.utilizationPct ?? null);
              const bpTone = achievementTone(bp?.utilizationPct ?? null);
              const gsTargetPerBayPerDay =
                gs && gs.bays > 0 && data.workingDaysElapsed > 0 ? gs.idealRoMtd / gs.bays / data.workingDaysElapsed : null;
              const bpTargetPerBayPerDay =
                bp && bp.bays > 0 && data.workingDaysElapsed > 0 ? bp.idealRoMtd / bp.bays / data.workingDaysElapsed : null;
              return (
                <BranchRow
                  key={branch.branch}
                  name={branchName(branch.branch)}
                  revenueMtd={branch.totalRevenueStreamMtd}
                  profitMtd={branch.profitMtd}
                  gsRos={gs?.actualRoMtd ?? null}
                  gsUtilizationPct={gs?.utilizationPct ?? null}
                  gsTone={gsTone}
                  gsProfitPerRo={branch.gsGrossProfitPerRoMtd}
                  bpRos={bp?.actualRoMtd ?? null}
                  bpUtilizationPct={bp?.utilizationPct ?? null}
                  bpTone={bpTone}
                  bpProfitPerRo={branch.bpGrossProfitPerRoMtd}
                  gsRevenuePerRo={branch.gsRevenuePerRoMtd}
                  bpRevenuePerRo={branch.bpRevenuePerRoMtd}
                  blendedRevenuePerRo={branch.blendedRevenuePerRoMtd}
                  gsBays={gs?.bays ?? 0}
                  bpBays={bp?.bays ?? 0}
                  gsTargetPerBayPerDay={gsTargetPerBayPerDay}
                  bpTargetPerBayPerDay={bpTargetPerBayPerDay}
                  gusSplit={gusSplit}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-fg-faint">
        GS Utilization is blank for Body &amp; Paint-only branches (no general-service bays). Ranked by whichever
        utilization figure is available, worst first. GUS Split is built from Service Info Report job lines (PM ·
        PDI · Accessories · General Repair, left to right) — its total is a separate figure from GS ROs above and
        can run a small amount apart from it.
      </p>
    </div>
  );
}
