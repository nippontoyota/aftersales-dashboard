import { RevenueIcon, StorefrontIcon, TargetIcon, WrenchIcon } from "@/components/dashboard-icons";
import { RichKpiCard } from "@/components/rich-kpi-card";
import { formatCompactCurrency } from "@/lib/format";
import type { VpScopeMetrics } from "@/lib/vp-data";
import { IncentiveSlabIndicator } from "../dashboard/incentive-slab-indicator";
import { tglossText } from "@/components/tgloss-text";

/**
 * The Executive Overview's new "read this first" layer (2026-09-25, at the
 * VP's request — the full grid felt like "just too many numbers"). Four
 * cards summarising the Group's most important figures, in the same
 * priority order as the VP's own brief: Total Revenue Stream (with its
 * incentive slab rings), then GUS Parts/Labour MTD (their most important
 * figures — no confirmed MTD target exists for either, so these show a
 * projected month-end figure and run rate instead of a target bar), then
 * TGLOSS (which does have a target, so it gets the full bar/gap/required-
 * rate treatment). The detailed grid with every region and every metric
 * still exists below, collapsed by default — this is a summary, not a
 * replacement.
 */
export function VpKpiCards({ group, date }: { group: VpScopeMetrics; date: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <RichKpiCard
        icon={<RevenueIcon />}
        color="red"
        label="Total Revenue Stream · MTD"
        value={formatCompactCurrency(group.totalRevenueStreamMtd)}
        extra={
          <IncentiveSlabIndicator scopeLabel="Group" actual={group.totalRevenueStreamMtd} slabs={group.incentiveSlabs} date={date} size={76} showActual={false} />
        }
      />
      <RichKpiCard
        icon={<StorefrontIcon />}
        color="blue"
        label="GUS Parts · MTD"
        value={formatCompactCurrency(group.gusPartsMtd)}
        sub={group.gusPartsPace.projectedEom !== null ? `Projected EOM ${formatCompactCurrency(group.gusPartsPace.projectedEom)}` : undefined}
        pace={group.gusPartsPace}
        formatPaceValue={formatCompactCurrency}
      />
      <RichKpiCard
        icon={<WrenchIcon />}
        color="amber"
        label="GUS Labour · MTD"
        value={formatCompactCurrency(group.gusLabourMtd)}
        sub={group.gusLabourPace.projectedEom !== null ? `Projected EOM ${formatCompactCurrency(group.gusLabourPace.projectedEom)}` : undefined}
        pace={group.gusLabourPace}
        formatPaceValue={formatCompactCurrency}
      />
      <RichKpiCard
        icon={<TargetIcon />}
        color="violet"
        label="TGLOSS · MTD"
        visualLabel={tglossText("TGLOSS · MTD")}
        value={formatCompactCurrency(group.tglossMtd)}
        actual={group.tglossMtd}
        target={group.tglossTarget}
        pace={group.tglossPace}
        paceTone={group.tglossPaceTone}
        formatPaceValue={formatCompactCurrency}
      />
    </div>
  );
}
