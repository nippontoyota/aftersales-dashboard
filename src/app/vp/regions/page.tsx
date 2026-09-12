import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { achievementRatio, type HeroSummary, type KpiSummary } from "@/lib/aggregate";
import { adminIdentityLabel } from "@/lib/admin-store";
import { formatCompact, formatCompactCurrency, formatPercent } from "@/lib/format";
import { regionForBranch, type RegionName } from "@/lib/regions";
import { loadVpData, type VpRegionRollup } from "@/lib/vp-data";
import { DAILY_REPORT_ROWS, branchCell, regionTotalCell } from "../../dashboard/daily-report-rows";
import { BranchLeaderboard } from "../branch-leaderboard";
import { FlagComposer } from "../flag-composer";
import { KeralaMap, type BranchPin } from "../kerala-map";
import { MetricSelect } from "../metric-select";
import { requireVpAccess } from "../vp-guard";
import { VpHeader } from "../vp-header";

type MetricKey = "total" | "gusro" | "bpuro" | "ext" | "vaspct";
const METRICS: {
  key: MetricKey;
  label: string;
  fmt: "num" | "rs" | "pct";
  get: (r: { hero: HeroSummary; kpis: KpiSummary }) => number | null;
}[] = [
  { key: "total", label: "Total Revenue MTD", fmt: "rs", get: (r) => r.hero.totalRevenueStreamMtd },
  { key: "gusro", label: "GUS RO MTD", fmt: "num", get: (r) => r.hero.gusRoMtd },
  { key: "bpuro", label: "BPU RO MTD", fmt: "num", get: (r) => r.hero.bpuRoMtd },
  { key: "ext", label: "External Sales MTD", fmt: "rs", get: (r) => r.hero.externalSalesMtd },
  { key: "vaspct", label: "VAS achievement %", fmt: "pct", get: (r) => achievementRatio(r.kpis.vasAchievementForTheMonth, r.kpis.vasBillTarget) },
];

function fmt(v: number | null, kind: "num" | "rs" | "pct"): string {
  if (v === null) return "—";
  return kind === "pct" ? formatPercent(v) : kind === "rs" ? formatCompactCurrency(v) : formatCompact(v);
}

const REGION_COLOR: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

export default async function VpRegionsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; region?: string; metric?: string; flag?: string }>;
}) {
  const admin = await requireVpAccess();
  return (
    <AppShell current="vp-regions" showDashboardLink vpNav identity={adminIdentityLabel(admin)}>
      <Suspense fallback={<DashboardPageSkeleton />}>
        <Regions searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Regions({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; region?: string; metric?: string; flag?: string }>;
}) {
  const params = await searchParams;
  const data = await loadVpData(params.date);
  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <VpHeader eyebrow="Nippon Group · Service" title="Regions" flagHref="/vp/regions?flag=1" />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
      </div>
    );
  }

  const metricKey = (METRICS.find((m) => m.key === params.metric)?.key ?? "total") as MetricKey;
  const metric = METRICS.find((m) => m.key === metricKey)!;
  const selectedRegion = (["North", "Central", "South"] as RegionName[]).find((r) => r === params.region) ?? null;

  const pins: BranchPin[] = data.report.branches.flatMap((b) => {
    const region = regionForBranch(b.branch);
    if (!region) return [];
    const v =
      metricKey === "total" ? b.totalRevenueStreamMtd
      : metricKey === "gusro" ? b.gusRoMtd
      : metricKey === "bpuro" ? b.bpuRoMtd
      : metricKey === "ext" ? b.externalSalesMtd
      : achievementRatio(b.vasAchievementForTheMonth, b.vasBillTarget);
    return [{ branch: b.branch, region, value: v, display: fmt(v, metric.fmt) }];
  });

  const chosen: VpRegionRollup | null = selectedRegion ? data.regions.find((r) => r.region === selectedRegion) ?? null : null;

  const groupMetricValue = metric.get(data.group);
  const regionSummaries = data.regions.map((r) => {
    const v = metric.get(r);
    return {
      region: r.region,
      display: fmt(v, metric.fmt),
      share: metric.fmt === "pct" || !groupMetricValue ? null : (v ?? 0) / groupMetricValue,
      branches: r.branches.length,
    };
  });

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      <VpHeader
        eyebrow="Nippon Group · Service"
        title="Regions"
        subtitle="Central, South and North — where the month stands across Kerala."
        dates={data.dates}
        date={data.date}
        basePath="/vp/regions"
        dateExtraParams={{ metric: metricKey }}
        flagHref={`/vp/regions?date=${data.date}&metric=${metricKey}${selectedRegion ? `&fregion=${selectedRegion}` : ""}&flag=1`}
      />

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="lg:w-[320px] lg:shrink-0">
          <KeralaMap
            pins={pins}
            regionSummaries={regionSummaries}
            metricLabel={metric.label}
            metricControl={
              <MetricSelect basePath="/vp/regions" options={METRICS.map((m) => ({ key: m.key, label: m.label }))} selected={metricKey} />
            }
            date={data.date}
            selectedRegion={selectedRegion}
          />
        </div>

        <div className="min-w-0 flex-1">
          {chosen ? (
            <>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: REGION_COLOR[chosen.region] }} />
                {chosen.region} — {chosen.branches.length} branches
              </h2>
              <div className="mt-3 max-h-[calc(100dvh-14rem)] overflow-auto rounded-xl border border-border bg-surface shadow-card">
            <table className="border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-20 [&>th]:border-b [&>th]:border-border">
                  <th className="sticky left-0 z-30 bg-surface py-2.5 pl-5 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-faint">
                    Metric
                  </th>
                  {chosen.branches.map((b) => (
                    <th
                      key={b.branch}
                      className="whitespace-nowrap bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle"
                    >
                      <Link
                        href={`/vp/branches?date=${data.date}&branch=${b.branch}&region=${chosen.region}`}
                        className="hover:text-accent-text hover:underline"
                      >
                        {b.branch}
                      </Link>
                    </th>
                  ))}
                  <th className="whitespace-nowrap bg-accent-soft/50 px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-text">
                    {chosen.region}
                  </th>
                </tr>
              </thead>
              <tbody>
                {DAILY_REPORT_ROWS.map((row, i) => {
                  if (row.kind === "group") {
                    return (
                      <tr key={`g${i}`}>
                        <td
                          colSpan={chosen.branches.length + 2}
                          className="border-t border-border bg-surface-2/70 py-2 pl-5 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle"
                        >
                          <span className="border-l-2 border-accent pl-2">{row.label}</span>
                        </td>
                      </tr>
                    );
                  }
                  const totalCell = regionTotalCell(row, chosen.branches);
                  return (
                    <tr key={`m${i}`} className="border-t border-border-subtle hover:bg-surface-2/40">
                      <td
                        className={`sticky left-0 z-10 whitespace-nowrap bg-surface py-2 pl-5 pr-3 ${
                          row.strong ? "font-semibold text-fg" : "text-fg-muted"
                        }`}
                      >
                        {row.label}
                      </td>
                      {chosen.branches.map((b) => {
                        const cell = branchCell(row, b);
                        return (
                          <td key={b.branch} className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg">
                            {cell.display == null ? <span className="text-fg-faint">—</span> : row.fmt(cell.display)}
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap bg-accent-soft/30 px-4 py-2 text-right font-semibold tabular-nums text-fg">
                        {totalCell.display == null ? <span className="text-fg-faint">—</span> : row.fmt(totalCell.display)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-fg">All branches</h2>
                <span className="text-[11px] text-fg-faint">ranked by total revenue · pick a region above</span>
              </div>
              <div className="mt-3">
                <BranchLeaderboard branches={data.report.branches} date={data.date} />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">VAS business — 3M vs Db outlets</div>
        <p className="mt-1.5 text-sm italic text-fg-faint">
          Coming soon — needs the 3M / Db outlet classification and the conversion &amp; TUS definitions from the VAS team.
        </p>
      </div>

      <FlagComposer page="region" date={data.date} />
    </div>
  );
}
