import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { RichKpiCard } from "@/components/rich-kpi-card";
import { StorefrontIcon, TargetIcon, WrenchIcon } from "@/components/dashboard-icons";
import { achievementTone } from "@/lib/aggregate";
import { adminIdentityLabel } from "@/lib/admin-store";
import { loadCeoData, type CeoRegionRollup } from "@/lib/ceo-data";
import { formatCompact, formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import { computePace, paceTone } from "@/lib/pace";
import { computeTrendSeries } from "@/lib/trend";
import { BranchPerformanceHeatmap } from "../dashboard/branch-performance-heatmap";
import { MetricSyncProvider } from "../dashboard/metric-sync";
import { RegionScorecard } from "../dashboard/region-scorecard";
import { TrendChart } from "../dashboard/trend-chart";
import { requireCeoAccess } from "./ceo-guard";
import { CeoHeader } from "./ceo-header";
import { Sparkline } from "./sparkline";
import { CEO_HEATMAP_METRICS, CEO_REGION_METRICS, CEO_TREND_METRICS } from "./tkm-metrics";

const TONE_TEXT = { good: "text-good", warn: "text-warn", critical: "text-bad", neutral: "text-fg" } as const;
const TONE_BAR = { good: "bg-good-solid", warn: "bg-warn-solid", critical: "bg-bad-solid", neutral: "bg-border-strong" } as const;

const REGION_COLOR: Record<CeoRegionRollup["region"], string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

export default async function CeoOverviewPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const admin = await requireCeoAccess();
  return (
    <AppShell current="ceo" showDashboardLink ceoNav identity={adminIdentityLabel(admin)}>
      <Suspense fallback={<DashboardPageSkeleton heroCards={3} />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Overview({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const data = await loadCeoData(params.date);

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <CeoHeader eyebrow="Nippon Group · Aftersales" title="Executive Overview" />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
      </div>
    );
  }
  if (!data.report || !data.group) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <CeoHeader eyebrow="Nippon Group · Aftersales" title="Executive Overview" dates={data.dates} date={data.date} basePath="/ceo" />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool report on file for {data.date}.
        </div>
      </div>
    );
  }

  const { group, regions, callout } = data;
  const uploadedAtLabel = new Date(data.report.uploadedAt).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  const kpis = group.kpis;
  const pace = {
    bpu: computePace(data.date, kpis.bpuAchievementForTheMonth, kpis.bpuTarget),
    offtake: computePace(data.date, kpis.offtakeAchievementForTheMonth, kpis.offtakeTarget),
    partsRetail: computePace(data.date, kpis.partsRetailAchievementForTheMonth, kpis.partsRetailTarget),
    pmOc: computePace(data.date, kpis.pmOcAchievementForTheMonth, kpis.pmOcTarget),
    tyre: computePace(data.date, kpis.tireSalesForTheMonth, kpis.tireTarget),
    battery: computePace(data.date, kpis.batterySalesForTheMonth, kpis.batteryTarget),
  };
  const tone = {
    bpu: paceTone(data.date, kpis.bpuAchievementForTheMonth, kpis.bpuTarget),
    offtake: paceTone(data.date, kpis.offtakeAchievementForTheMonth, kpis.offtakeTarget),
    partsRetail: paceTone(data.date, kpis.partsRetailAchievementForTheMonth, kpis.partsRetailTarget),
    pmOc: paceTone(data.date, kpis.pmOcAchievementForTheMonth, kpis.pmOcTarget),
    tyre: paceTone(data.date, kpis.tireSalesForTheMonth, kpis.tireTarget),
    battery: paceTone(data.date, kpis.batterySalesForTheMonth, kpis.batteryTarget),
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      <CeoHeader
        eyebrow="Nippon Group · Aftersales"
        title="Executive Overview"
        subtitle="Company-wide, daily — revenue and bay utilization, month-to-date."
        dates={data.dates}
        date={data.date}
        basePath="/ceo"
        asOfLabel={uploadedAtLabel}
      />

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <RevenueTile label="Total Revenue · MTD" value={group.hero.totalRevenueStreamMtd} sub="No revenue target configured yet" />
        <RevenueTile label="Gross Profit · MTD" value={group.profit.grossProfitMtd} sub="Modelled from fixed margin assumptions" />
        <UtilizationTile
          label="GS Bay Utilization"
          sub="General Service"
          utilization={group.utilization.gs}
          trend={data.gsRoTrend.map((p) => p.actual)}
        />
        <UtilizationTile
          label="BP Bay Utilization"
          sub="Body & Paint"
          utilization={group.utilization.bp}
          trend={data.bpRoTrend.map((p) => p.actual)}
        />
      </div>

      {callout ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft/40 px-4 py-3">
          <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-warn" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M5 8a5 5 0 0 1 10 0c0 3.5 1.2 4.8 1.2 4.8H3.8S5 11.5 5 8z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8.3 15.5a1.8 1.8 0 0 0 3.4 0" strokeLinecap="round" />
          </svg>
          <p className="text-[13px] text-fg">
            <span className="font-semibold">{callout.region}</span> is lagging on {callout.metric} bay utilization at{" "}
            <span className="font-semibold">{formatPercent(callout.utilizationPct)}</span> of pace
            {callout.worstBranch ? (
              <>
                , driven by <span className="font-semibold">{callout.worstBranch.branch}</span> at{" "}
                {formatPercent(callout.worstBranch.utilizationPct)}
              </>
            ) : null}
            .
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {regions.map((r) => (
          <RegionCard key={r.region} region={r} date={data.date} />
        ))}
      </div>

      <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">Group KPIs — MTD</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <RichKpiCard
          icon={<WrenchIcon />}
          color="blue"
          label="BPU Achievement"
          value={formatNumber(kpis.bpuAchievementForTheMonth)}
          actual={kpis.bpuAchievementForTheMonth}
          target={kpis.bpuTarget}
          hasPreviousUpload={data.report.hasPreviousSnapshot}
          pace={pace.bpu}
          paceTone={tone.bpu}
        />
        <RichKpiCard
          icon={<TargetIcon />}
          color="violet"
          label="Offtake (SPO)"
          value={formatCompactCurrency(kpis.offtakeAchievementForTheMonth)}
          actual={kpis.offtakeAchievementForTheMonth}
          target={kpis.offtakeTarget}
          hasPreviousUpload={data.report.hasPreviousSnapshot}
          pace={pace.offtake}
          paceTone={tone.offtake}
          formatPaceValue={formatCompactCurrency}
        />
        <RichKpiCard
          icon={<StorefrontIcon />}
          color="emerald"
          label="Parts Retail (SPR)"
          value={formatCompactCurrency(kpis.partsRetailAchievementForTheMonth)}
          actual={kpis.partsRetailAchievementForTheMonth}
          target={kpis.partsRetailTarget}
          hasPreviousUpload={data.report.hasPreviousSnapshot}
          pace={pace.partsRetail}
          paceTone={tone.partsRetail}
          formatPaceValue={formatCompactCurrency}
        />
        <RichKpiCard
          icon={<TargetIcon />}
          color="blue"
          label="PM+OC"
          value={formatNumber(kpis.pmOcAchievementForTheMonth)}
          actual={kpis.pmOcAchievementForTheMonth}
          target={kpis.pmOcTarget}
          hasPreviousUpload={data.report.hasPreviousSnapshot}
          pace={pace.pmOc}
          paceTone={tone.pmOc}
        />
        <RichKpiCard
          icon={<WrenchIcon />}
          color="amber"
          label="Tyre"
          value={formatNumber(kpis.tireSalesForTheMonth)}
          actual={kpis.tireSalesForTheMonth}
          target={kpis.tireTarget}
          hasPreviousUpload={data.report.hasPreviousSnapshot}
          pace={pace.tyre}
          paceTone={tone.tyre}
        />
        <RichKpiCard
          icon={<TargetIcon />}
          color="teal"
          label="Battery"
          value={formatNumber(kpis.batterySalesForTheMonth)}
          actual={kpis.batterySalesForTheMonth}
          target={kpis.batteryTarget}
          hasPreviousUpload={data.report.hasPreviousSnapshot}
          pace={pace.battery}
          paceTone={tone.battery}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <div className="text-[11px] font-medium tracking-[0.01em] text-fg-subtle">GUS for the Month</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums text-fg">{formatNumber(kpis.gusRoMtd)}</div>
          <div className="mt-1 text-[11px] text-fg-faint">No target configured for this view yet</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <div className="text-[11px] font-medium tracking-[0.01em] text-fg-subtle">Used Oil Revenue · MTD</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums text-fg">{formatCompactCurrency(group.hero.usedOilRevenueMtd)}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <div className="text-[11px] font-medium tracking-[0.01em] text-fg-subtle">Other Scrap Revenue · MTD</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums text-fg">{formatCompactCurrency(group.hero.scrapRevenueMtd)}</div>
        </div>
      </div>

      <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">Profit Breakdown — MTD</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <ProfitTile label="Total Parts Profit" value={group.profit.partsProfitMtd} sub="20% of GUS + BPU Parts + External Sales" />
        <ProfitTile label="Total Labour Profit" value={group.profit.labourProfitMtd} sub="100% of GUS + BPU Labour" />
        <ProfitTile label="TGLOSS Margin" value={group.profit.tglossMarginMtd} sub="38% of TGLOSS Revenue" />
        <ProfitTile label="GS Gross Profit / RO" value={group.profit.gsGrossProfitPerRo} sub="GS Labour + 20% GS Parts ÷ GUS ROs" />
        <ProfitTile label="BP Gross Profit / RO" value={group.profit.bpGrossProfitPerRo} sub="BP Labour + 20% BP Parts ÷ BPU ROs" />
        <ProfitTile label="Gross Profit / RO" value={group.profit.blendedGrossProfitPerRo} sub="Gross Profit ÷ total ROs, both channels" strong />
      </div>

      <MetricSyncProvider initialMetric={CEO_TREND_METRICS[0].key}>
        <div className="mt-4">
          <TrendChart
            seriesByMetric={{
              partsRetail: computeTrendSeries(data.monthSnapshots, "All", "sprInternal", "sprInternalTarget"),
              bpu: computeTrendSeries(data.monthSnapshots, "All", "bpus", "bpusTarget"),
              offtake: computeTrendSeries(data.monthSnapshots, "All", "spoDealer", "spoDealerTarget"),
              pmOc: computeTrendSeries(data.monthSnapshots, "All", "pm", "pmTarget"),
              tyre: computeTrendSeries(data.monthSnapshots, "All", "tyreActual", "tyreTarget"),
              battery: computeTrendSeries(data.monthSnapshots, "All", "batteryActuals", "batteryTarget"),
            }}
            metrics={CEO_TREND_METRICS}
            date={data.date}
            chartHeight={150}
          />
        </div>

        <div className="mt-4">
          <RegionScorecard branches={data.report.branches} monthSnapshots={data.monthSnapshots} metrics={CEO_REGION_METRICS} date={data.date} />
        </div>

        <div className="mt-4">
          <BranchPerformanceHeatmap branches={data.report.branches} metrics={CEO_HEATMAP_METRICS} date={data.date} monthSnapshots={data.monthSnapshots} />
        </div>
      </MetricSyncProvider>

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-fg-faint">
        Bay Utilization = actual GUS/BPU repair orders this month ÷ ideal capacity for the same number of elapsed working
        days ({data.workingDaysElapsed} so far this month) — pace-adjusted, not a flat monthly-target %. GS ideal capacity
        is bays × 5.85 jobs/bay/day; BP ideal capacity comes from each branch&apos;s 2025 job-mix-weighted cycle-time model.
        Revenue = GUS + BPU parts &amp; labour + External Sales + scrap/used oil, no target yet configured for this view.
        Gross Profit is a modelled figure, not an audited number: Total Parts Profit (20% of GUS + BPU Parts + External
        Sales) + Total Labour Profit (100% of GUS + BPU Labour) + TGLOSS Margin (38% of TGLOSS Revenue) + scrap/used-oil
        revenue. GS/BP Gross Profit per RO exclude External Sales and TGLOSS Margin, which aren&apos;t split by channel.
      </p>
    </div>
  );
}

function RevenueTile({ label, value, sub }: { label: string; value: number | null; sub: string }) {
  return (
    <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-5 shadow-card">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-faint">{label}</div>
      <div className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight text-fg">{formatCompactCurrency(value)}</div>
      <div className="mt-2 text-[11px] text-fg-faint">{sub}</div>
    </div>
  );
}

function ProfitTile({ label, value, sub, strong }: { label: string; value: number | null; sub: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 shadow-card ${strong ? "border-accent/30 bg-accent-soft/30" : "border-border bg-surface"}`}>
      <div className="text-[11px] font-medium tracking-[0.01em] text-fg-subtle">{label}</div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums text-fg">{formatCompactCurrency(value)}</div>
      <div className="mt-1 text-[10.5px] text-fg-faint">{sub}</div>
    </div>
  );
}

function UtilizationTile({
  label,
  sub,
  utilization,
  trend,
}: {
  label: string;
  sub: string;
  utilization: { utilizationPct: number; actualRoMtd: number; idealRoMtd: number } | null;
  trend: (number | null)[];
}) {
  const tone = achievementTone(utilization?.utilizationPct ?? null);
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-faint">{label}</div>
        <div className="text-[10px] text-fg-faint">{sub}</div>
      </div>
      <div className={`mt-1.5 text-3xl font-semibold tabular-nums tracking-tight ${TONE_TEXT[tone]}`}>
        {utilization ? formatPercent(utilization.utilizationPct) : "—"}
      </div>
      {utilization ? (
        <div className="mt-1 text-[11px] text-fg-subtle">
          {formatCompact(utilization.actualRoMtd)} ROs vs {formatCompact(utilization.idealRoMtd)} ideal
        </div>
      ) : null}
      <div className={TONE_TEXT[tone]}>
        <Sparkline points={trend} className="mt-2" />
      </div>
    </div>
  );
}

function RegionCard({ region, date }: { region: CeoRegionRollup; date: string }) {
  const gsTone = achievementTone(region.utilization.gs?.utilizationPct ?? null);
  const bpTone = achievementTone(region.utilization.bp?.utilizationPct ?? null);
  return (
    <Link
      href={`/ceo/branches?date=${date}&region=${region.region}`}
      className="block rounded-xl border border-border bg-surface p-4 shadow-card transition hover:border-accent/40 hover:bg-surface-2/40"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-fg">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: REGION_COLOR[region.region] }} />
          {region.region}
        </span>
        <span className="text-[11px] text-fg-faint">{region.branches.length} branches</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums text-fg">{formatCompactCurrency(region.hero.totalRevenueStreamMtd)}</span>
        <span className="text-[11px] text-fg-subtle">· {formatCompactCurrency(region.hero.profitMtd)} profit</span>
      </div>
      <div className="mt-3 space-y-1.5">
        <UtilizationBar label="GS" pct={region.utilization.gs?.utilizationPct ?? null} tone={gsTone} />
        <UtilizationBar label="BP" pct={region.utilization.bp?.utilizationPct ?? null} tone={bpTone} />
      </div>
    </Link>
  );
}

function UtilizationBar({ label, pct, tone }: { label: string; pct: number | null; tone: ReturnType<typeof achievementTone> }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-6 shrink-0 font-medium text-fg-subtle">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <span className={`block h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${Math.min(100, Math.round((pct ?? 0) * 100))}%` }} />
      </span>
      <span className={`w-9 shrink-0 text-right tabular-nums ${TONE_TEXT[tone]}`}>{pct === null ? "—" : `${Math.round(pct * 100)}%`}</span>
    </div>
  );
}
