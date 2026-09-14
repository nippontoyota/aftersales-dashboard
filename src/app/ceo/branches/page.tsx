import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { achievementTone } from "@/lib/aggregate";
import { adminIdentityLabel } from "@/lib/admin-store";
import { loadCeoData } from "@/lib/ceo-data";
import { formatCompact, formatCompactCurrency, formatPercent } from "@/lib/format";
import type { RegionName } from "@/lib/regions";
import { requireCeoAccess } from "../ceo-guard";
import { CeoHeader } from "../ceo-header";

const TONE_TEXT = { good: "text-good", warn: "text-warn", critical: "text-bad", neutral: "text-fg-faint" } as const;

export default async function CeoBranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; region?: string }>;
}) {
  const admin = await requireCeoAccess();
  return (
    <AppShell current="ceo" showDashboardLink ceoNav identity={adminIdentityLabel(admin)}>
      <Suspense fallback={<DashboardPageSkeleton />}>
        <Branches searchParams={searchParams} />
      </Suspense>
    </AppShell>
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
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">GS ROs</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">GS Utilization</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">BP ROs</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">BP Utilization</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ branch, gs, bp }) => {
              const gsTone = achievementTone(gs?.utilizationPct ?? null);
              const bpTone = achievementTone(bp?.utilizationPct ?? null);
              return (
                <tr key={branch.branch} className="border-t border-border-subtle hover:bg-surface-2/40">
                  <td className="whitespace-nowrap py-2 pl-5 pr-3 font-semibold text-fg">{branch.branch}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-fg">{formatCompactCurrency(branch.totalRevenueStreamMtd)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{gs ? formatCompact(gs.actualRoMtd) : "—"}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${TONE_TEXT[gsTone]}`}>
                    {gs ? formatPercent(gs.utilizationPct) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{bp ? formatCompact(bp.actualRoMtd) : "—"}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${TONE_TEXT[bpTone]}`}>
                    {bp ? formatPercent(bp.utilizationPct) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-fg-faint">
        GS Utilization is blank for Body &amp; Paint-only branches (no general-service bays). Ranked by whichever
        utilization figure is available, worst first.
      </p>
    </div>
  );
}
