import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { RichKpiCard } from "@/components/rich-kpi-card";
import { StorefrontIcon, TargetIcon, WrenchIcon } from "@/components/dashboard-icons";
import { achievementRatio, achievementTone } from "@/lib/aggregate";
import { adminIdentityLabel } from "@/lib/admin-store";
import { loadCeoData, type CeoRegionRollup } from "@/lib/ceo-data";
import { formatCompact, formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import { computePace, paceTone } from "@/lib/pace";
import { computeTrendSeries } from "@/lib/trend";
import { BranchPerformanceHeatmap } from "../dashboard/branch-performance-heatmap";
import { MetricSyncProvider } from "../dashboard/metric-sync";
import { RegionScorecard } from "../dashboard/region-scorecard";
import { TrendChart } from "../dashboard/trend-chart";
import { DraftWarning } from "@/components/draft-warning";
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
    gus: computePace(data.date, kpis.gusRoMtd, group.gusMonthTarget),
    bpu: computePace(data.date, kpis.bpuAchievementForTheMonth, kpis.bpuTarget),
    offtake: computePace(data.date, kpis.offtakeAchievementForTheMonth, kpis.offtakeTarget),
    partsRetail: computePace(data.date, kpis.partsRetailAchievementForTheMonth, kpis.partsRetailTarget),
    pmOc: computePace(data.date, kpis.pmOcAchievementForTheMonth, kpis.pmOcTarget),
    tyre: computePace(data.date, kpis.tireSalesForTheMonth, kpis.tireTarget),
    battery: computePace(data.date, kpis.batterySalesForTheMonth, kpis.batteryTarget),
  };
  const tone = {
    gus: paceTone(data.date, kpis.gusRoMtd, group.gusMonthTarget),
    bpu: paceTone(data.date, kpis.bpuAchievementForTheMonth, kpis.bpuTarget),
    offtake: paceTone(data.date, kpis.offtakeAchievementForTheMonth, kpis.offtakeTarget),
    partsRetail: paceTone(data.date, kpis.partsRetailAchievementForTheMonth, kpis.partsRetailTarget),
    pmOc: paceTone(data.date, kpis.pmOcAchievementForTheMonth, kpis.pmOcTarget),
    tyre: paceTone(data.date, kpis.tireSalesForTheMonth, kpis.tireTarget),
    battery: paceTone(data.date, kpis.batterySalesForTheMonth, kpis.batteryTarget),
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      {!data.isPublished && (
        <DraftWarning uploadedBranches={data.uploadedBranchCount} totalBranches={data.totalBranchCount} />
      )}
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
        <RevenueTile
          label="Total Revenue · MTD"
          value={group.hero.totalRevenueStreamMtd}
          target={group.revenueTarget?.total ?? null}
          fallbackSub="No revenue target configured yet"
        />
        <RevenueTile
          label="Gross Profit · MTD"
          value={group.profit.grossProfitMtd}
          target={group.profitTarget?.total ?? null}
          fallbackSub="Modelled from fixed margin assumptions"
        />
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

      <h2 className="mt-10 text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">Group KPIs — MTD</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
        <RichKpiCard
          icon={<TargetIcon />}
          color="red"
          label="GUS for the Month"
          value={formatNumber(kpis.gusRoMtd)}
          actual={kpis.gusRoMtd}
          target={group.gusMonthTarget}
          hasPreviousUpload={data.report.hasPreviousSnapshot}
          pace={pace.gus}
          paceTone={tone.gus}
        />
        <div className="group relative overflow-hidden rounded-lg border border-border-subtle bg-surface/60 p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
          <div className="text-[10px] font-semibold tracking-wide text-fg-subtle">Used Oil Revenue · MTD</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-fg">{formatCompactCurrency(group.hero.usedOilRevenueMtd)}</div>
        </div>
        <div className="group relative overflow-hidden rounded-lg border border-border-subtle bg-surface/60 p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
          <div className="text-[10px] font-semibold tracking-wide text-fg-subtle">Other Scrap Revenue · MTD</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-fg">{formatCompactCurrency(group.hero.scrapRevenueMtd)}</div>
        </div>
      </div>

      <h2 className="mt-10 text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">Profit Breakdown — MTD</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <ProfitTile
          label="Total Parts Profit"
          value={group.profit.partsProfitMtd}
          target={group.profitTarget?.partsProfit ?? null}
          sub="20% of GUS + BPU Parts + External Sales"
        />
        <ProfitTile
          label="Total Labour Profit"
          value={group.profit.labourProfitMtd}
          target={group.profitTarget?.labourProfit ?? null}
          sub="100% of GUS + BPU Labour"
        />
        <ProfitTile
          label="TGLOSS Margin"
          value={group.profit.tglossMarginMtd}
          target={group.profitTarget?.tglossMargin ?? null}
          sub="38% of TGLOSS Revenue"
        />
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
        GUS-for-the-Month Target = GS bays × 5.85 jobs/bay/day × every working day in the month (not just elapsed) —
        same formula as Bay Utilization&apos;s ideal capacity, just for the whole month instead of pace-to-date.
        Revenue = GUS + BPU parts &amp; labour + External Sales + scrap/used oil. Revenue Target (and the Target lines above)
        derive from each branch&apos;s own Incentive Slab 3 target × 30/32, split 9.5:20.5 into a Labour bucket and a
        Parts+ExtSales+TGLOSS bucket, then 66/34 GS/BP within Labour and 62/38 GS/BP within Parts (fixed ratios) — with
        TGLOSS Target carved out as the existing VAS Bill Target (GUS RO MTD × 38% × Rs 3,000) and Ext Sales Target as 5%
        of the branch&apos;s own Parts Retail target.
        Gross Profit is a modelled figure, not an audited number: Total Parts Profit (20% of GUS + BPU Parts + External
        Sales) + Total Labour Profit (100% of GUS + BPU Labour) + TGLOSS Margin (38% of TGLOSS Revenue) + scrap/used-oil
        revenue — Profit Target follows the same formula against the Revenue Target components above, plus the same
        actual scrap/used-oil figure on both sides. GS/BP Gross Profit per RO exclude External Sales and TGLOSS Margin,
        which aren&apos;t split by channel.
      </p>
    </div>
  );
}

function RevenueTile({ label, value, target, fallbackSub }: { label: string; value: number | null; target: number | null; fallbackSub: string }) {
  const pct = achievementRatio(value, target);
  const tone = achievementTone(pct);
  return (
    <div className="group relative overflow-hidden rounded-xl border border-accent/20 bg-accent-soft/30 bg-gradient-to-br from-accent/5 to-transparent p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">{label}</div>
      <div className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tighter text-fg">{formatCompactCurrency(value)}</div>
      {target !== null ? (
        <div className={`mt-2 text-[11px] font-medium ${TONE_TEXT[tone]}`}>
          {formatPercent(pct)} of {formatCompactCurrency(target)} target
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-fg-faint transition-colors duration-200 group-hover:text-fg-subtle">{fallbackSub}</div>
      )}
    </div>
  );
}

function ProfitTile({
  label,
  value,
  sub,
  strong,
  target,
}: {
  label: string;
  value: number | null;
  sub: string;
  strong?: boolean;
  target?: number | null;
}) {
  const pct = target !== undefined ? achievementRatio(value, target) : null;
  const tone = achievementTone(pct);
  return (
    <div
      className={`group relative overflow-hidden rounded-lg border p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] ${
        strong
          ? "border-accent/20 bg-accent-soft/20 bg-gradient-to-br from-accent/5 to-transparent"
          : "border-border-subtle bg-surface/60"
      }`}
    >
      <div className="text-[10px] font-semibold tracking-wide text-fg-subtle">{label}</div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-fg">{formatCompactCurrency(value)}</div>
      <div className="mt-1 text-[10.5px] text-fg-faint transition-colors duration-200 group-hover:text-fg-subtle">{sub}</div>
      {target !== undefined && target !== null ? (
        <div className={`mt-1 text-[10.5px] font-medium ${TONE_TEXT[tone]}`}>
          {formatPercent(pct)} of {formatCompactCurrency(target)} target
        </div>
      ) : null}
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
    <div className="group relative overflow-hidden rounded-xl border border-border-subtle bg-surface/60 bg-gradient-to-br from-surface to-transparent p-5 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">{label}</div>
        <div className="text-[10px] text-fg-faint transition-colors duration-200 group-hover:text-fg-subtle">{sub}</div>
      </div>
      <div className={`mt-1.5 text-3xl font-semibold tabular-nums tracking-tighter ${TONE_TEXT[tone]}`}>
        {utilization ? formatPercent(utilization.utilizationPct) : "—"}
      </div>
      {utilization ? (
        <div className="mt-1 text-[11px] text-fg-faint transition-colors duration-200 group-hover:text-fg-subtle">
          {formatCompact(utilization.actualRoMtd)} ROs vs {formatCompact(utilization.idealRoMtd)} ideal
        </div>
      ) : null}
      <div className={`drop-shadow-sm ${TONE_TEXT[tone]}`}>
        <Sparkline points={trend} className="mt-2 opacity-80 transition-opacity duration-200 group-hover:opacity-100" />
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
      className="group block rounded-xl border border-border-subtle bg-surface/60 p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:border-accent/40 hover:bg-surface hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-fg">
          <span className="h-2 w-2 rounded-full shadow-sm" style={{ background: REGION_COLOR[region.region] }} />
          {region.region}
        </span>
        <span className="text-[11px] font-medium text-fg-faint transition-colors duration-200 group-hover:text-fg-subtle">{region.branches.length} branches</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums tracking-tight text-fg">{formatCompactCurrency(region.hero.totalRevenueStreamMtd)}</span>
        <span className="text-[11px] text-fg-subtle transition-colors duration-200 group-hover:text-fg">· {formatCompactCurrency(region.hero.profitMtd)} profit</span>
      </div>
      <div className="mt-4 space-y-2">
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
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 shadow-inner">
        <span
          className={`block h-full rounded-full transition-all duration-1000 ease-out ${TONE_BAR[tone]}`}
          style={{ width: `${Math.min(100, Math.round((pct ?? 0) * 100))}%` }}
        />
      </span>
      <span className={`w-9 shrink-0 text-right tabular-nums font-medium ${TONE_TEXT[tone]}`}>
        {pct === null ? "—" : `${Math.round(pct * 100)}%`}
      </span>
    </div>
  );
}
