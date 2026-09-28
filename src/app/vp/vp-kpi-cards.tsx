import { ExternalSalesIcon, RevenueIcon, StorefrontIcon, TargetIcon, WrenchIcon } from "@/components/dashboard-icons";
import { RichKpiCard, type TrendInfo } from "@/components/rich-kpi-card";
import { formatCompactCurrency } from "@/lib/format";
import type { VpScopeMetrics } from "@/lib/vp-data";
import { IncentiveSlabIndicator } from "../dashboard/incentive-slab-indicator";
import { tglossText } from "@/components/tgloss-text";
import { VpMetricArea } from "./vp-compare";
import type { MetricKey } from "./vp-metrics";
import { VpPairedKpiCard } from "./vp-paired-kpi-card";

/** Every hero card is the Group figure — clicking it lists the branches behind it, ranked. */
function groupTarget(metric: MetricKey, value: number | null) {
  return { metric, value, scope: { label: "Group", region: null } };
}

/** "vs last upload" growth chip for one metric — null (no chip) whenever
 * either side is missing/zero, same "skip rather than guess" rule the rest
 * of this page follows. `previousDate` only feeds the tooltip text. */
function trendFor(current: number | null, previous: number | null | undefined, previousDate: string | null | undefined): TrendInfo | null {
  if (current === null || previous === null || previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  return { pct, title: `${formatCompactCurrency(previous)} as of ${previousDate ?? "the previous upload"} → ${formatCompactCurrency(current)}` };
}

/**
 * The Executive Overview's "read this first" layer (2026-09-25, at the VP's
 * request — the full grid felt like "just too many numbers"; shrunk to a
 * denser, five-card row on 2026-09-26, also at his request, with GUS and BPU
 * paired into one card per revenue line instead of GUS standing alone).
 * Priority order follows the VP's own brief: Total Revenue Stream (with its
 * incentive slab rings), then Parts and Labour (GUS + BPU together — no
 * confirmed MTD target exists for either, so these show a projected
 * month-end figure and run rate instead of a target bar), then TGLOSS
 * (which does have a target, so it gets the full bar/gap/required-rate
 * treatment), then External Sales. The detailed grid with every region and
 * every metric still exists below, collapsed by default — this is a
 * summary, not a replacement.
 */
export function VpKpiCards({
  group,
  date,
  previous,
  previousDate,
}: {
  group: VpScopeMetrics;
  date: string;
  /** The Group scope as of the previous upload — drives each card's "vs last upload" chip. Omit/null to hide every chip (e.g. this month's first upload). */
  previous?: VpScopeMetrics | null;
  previousDate?: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      <VpMetricArea className="h-full" target={groupTarget("totalRevenue", group.totalRevenueStreamMtd)}>
      <RichKpiCard
        compact
        icon={<RevenueIcon />}
        color="red"
        label="Total Revenue Stream · MTD"
        value={formatCompactCurrency(group.totalRevenueStreamMtd)}
        trend={trendFor(group.totalRevenueStreamMtd, previous?.totalRevenueStreamMtd, previousDate)}
        extra={
          <IncentiveSlabIndicator scopeLabel="Group" actual={group.totalRevenueStreamMtd} slabs={group.incentiveSlabs} date={date} size={56} showActual={false} />
        }
      />
      </VpMetricArea>
      <VpPairedKpiCard
        primaryTarget={groupTarget("gusParts", group.gusPartsMtd)}
        secondaryTarget={groupTarget("bpuParts", group.bpuPartsMtd)}
        icon={<StorefrontIcon />}
        color="blue"
        title="Parts · MTD"
        primaryLabel="GUS Parts"
        primaryValue={formatCompactCurrency(group.gusPartsMtd)}
        primaryPace={group.gusPartsPace}
        primaryTrend={trendFor(group.gusPartsMtd, previous?.gusPartsMtd, previousDate)}
        secondaryLabel="BPU Parts"
        secondaryValue={formatCompactCurrency(group.bpuPartsMtd)}
        secondaryPace={group.bpuPartsPace}
        secondaryTrend={trendFor(group.bpuPartsMtd, previous?.bpuPartsMtd, previousDate)}
        formatPaceValue={formatCompactCurrency}
      />
      <VpPairedKpiCard
        primaryTarget={groupTarget("gusLabour", group.gusLabourMtd)}
        secondaryTarget={groupTarget("bpuLabour", group.bpuLabourMtd)}
        icon={<WrenchIcon />}
        color="amber"
        title="Labour · MTD"
        primaryLabel="GUS Labour"
        primaryValue={formatCompactCurrency(group.gusLabourMtd)}
        primaryPace={group.gusLabourPace}
        primaryTrend={trendFor(group.gusLabourMtd, previous?.gusLabourMtd, previousDate)}
        secondaryLabel="BPU Labour"
        secondaryValue={formatCompactCurrency(group.bpuLabourMtd)}
        secondaryPace={group.bpuLabourPace}
        secondaryTrend={trendFor(group.bpuLabourMtd, previous?.bpuLabourMtd, previousDate)}
        formatPaceValue={formatCompactCurrency}
      />
      <VpMetricArea className="h-full" target={groupTarget("tglossMtd", group.tglossMtd)}>
      <RichKpiCard
        compact
        icon={<TargetIcon />}
        color="violet"
        label="TGLOSS · MTD"
        visualLabel={tglossText("TGLOSS · MTD")}
        value={formatCompactCurrency(group.tglossMtd)}
        trend={trendFor(group.tglossMtd, previous?.tglossMtd, previousDate)}
        actual={group.tglossMtd}
        target={group.tglossTarget}
        pace={group.tglossPace}
        paceTone={group.tglossPaceTone}
        formatPaceValue={formatCompactCurrency}
      />
      </VpMetricArea>
      <VpMetricArea className="h-full" target={groupTarget("externalSales", group.externalSalesMtd)}>
      <RichKpiCard
        compact
        icon={<ExternalSalesIcon />}
        color="teal"
        label="External Sales · MTD"
        value={formatCompactCurrency(group.externalSalesMtd)}
        trend={trendFor(group.externalSalesMtd, previous?.externalSalesMtd, previousDate)}
        sub={group.externalSalesPace.projectedEom !== null ? `Projected EOM ${formatCompactCurrency(group.externalSalesPace.projectedEom)}` : undefined}
        pace={group.externalSalesPace}
        formatPaceValue={formatCompactCurrency}
      />
      </VpMetricArea>
    </div>
  );
}
