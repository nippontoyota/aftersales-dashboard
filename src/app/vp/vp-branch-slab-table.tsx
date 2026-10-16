import { CO01B_SLAB_COMBINED_BRANCHES } from "@/lib/body-paint-only";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import { aggregateIncentiveSlabTargets } from "@/lib/incentive-slabs/aggregate";
import type { IncentiveSlabTargets } from "@/lib/incentive-slabs/store";
import { computePace } from "@/lib/pace";
import { REGIONS, regionForBranch, type RegionName } from "@/lib/regions";
import type { BranchReport } from "@/lib/report";
import type { VpScopeMetrics } from "@/lib/vp-data";
import { SectionTable, type SectionColumn } from "../dashboard/section-table";
import { SLAB_GREEN_CLASS, slabBandClassName } from "./vp-band-colors";
import { VpBranchLabel, VpMetricButton } from "./vp-compare";
import type { MetricKey } from "./vp-metrics";

/**
 * Per-branch Slab 1–4 incentive tracking (2026-09-28, matching the bottom
 * half of the VP's own "Service daily report" Excel sheet) — every branch's
 * own rupee target for each slab plus its % achievement, colour-banded the
 * same green/yellow/orange/red way as the Regions per-vehicle table above
 * it. Graded against Total Revenue Stream (the same actual the ring
 * indicators elsewhere on this page use).
 *
 * CO01E never gets its own row — see CO01B_SLAB_COMBINED_BRANCHES
 * (body-paint-only.ts): its slab thresholds were set as one combined target
 * with CO01B, not two separately achievable ones, same rule the main
 * dashboard's hero cards already apply. Shown as "CO01B + CO01E" instead,
 * against CO01B's own target with CO01E's actual folded in.
 *
 * The exact green/yellow/orange/red cutoffs on the VP's own sheet aren't
 * independently confirmed (no legend was supplied for this half, unlike the
 * per-vehicle table's), so this reuses the same 100/90/75% bands as the
 * rest of the app's achievement colouring (aggregate.ts's achievementTone,
 * extended with one more tier the way PARTS_PER_RO_BANDS etc. already do).
 *
 * Tinted, not solid, fills (2026-09-28, at the VP's request — a whole table
 * of solid-fill badges read as visually "loud"/congested; a soft tint still
 * reads the colour at a glance without the same weight).
 *
 * Colour reflects month-end PACE, not today's raw ratio (2026-10-15, at the
 * VP's request — graded against the full-month target, almost every cell
 * reads red until late in the month by construction, which told him nothing
 * useful mid-month). Three states, same distinction the hero-card slab rings
 * already draw (incentive-slab-indicator.tsx, fixed there 2026-09-19 after a
 * reported bug where a forecast rendered as if already achieved):
 *   - already achieved (today's actual ≥ this slab's target) → solid green,
 *     unchanged from before.
 *   - not yet achieved, but projected (computePace's working-day-aware run
 *     rate, same methodology as the rings/TGLOSS pace) to clear it by
 *     month-end → the same green tint, but with a dashed border, so it never
 *     reads as already banked.
 *   - not on pace → graded on the *projected* ratio with the same 100/90/75%
 *     cutoffs the plain ratio used before, so "how far off pace" still reads
 *     at a glance instead of everything just being red.
 * The displayed percentage itself is always today's actual ÷ target —
 * unchanged by any of this, only the colour moves.
 */
function SlabCell({
  target,
  actual,
  metric,
  branch,
  date,
  holidays,
}: {
  target: number | undefined;
  actual: number | null;
  metric: MetricKey;
  branch: string;
  date: string;
  holidays: ReadonlySet<string>;
}) {
  if (target === undefined) {
    return <div className="w-16 text-right text-sm text-fg-faint">—</div>;
  }
  const ratio = actual === null || target === 0 ? null : actual / target;
  const achieved = ratio !== null && ratio >= 1;
  const projectedRatio = ratio === null || achieved ? null : computePace(date, actual, target, holidays).projectedAchievementRatio;
  const onPace = projectedRatio !== null && projectedRatio >= 1;
  const toneClassName =
    ratio === null ? "bg-surface-2 text-fg-faint" : achieved ? slabBandClassName(ratio) : onPace ? `${SLAB_GREEN_CLASS} border border-dashed border-emerald-400/50` : slabBandClassName(projectedRatio);
  const badgeClass = `flex h-6 w-full items-center justify-center rounded text-[11px] font-semibold tabular-nums ${toneClassName}`;
  const label = ratio === null ? "—" : formatPercent(ratio);
  const isTotal = branch === ALL_BRANCHES_LABEL;
  return (
    <div className="flex w-20 flex-col items-end gap-1">
      <div className="whitespace-nowrap text-[10px] tabular-nums text-fg-faint">{formatCompactCurrency(target)}</div>
      {ratio === null ? (
        <div className={badgeClass}>{label}</div>
      ) : (
        <VpMetricButton
          className={badgeClass}
          target={{
            metric,
            value: ratio,
            ...(isTotal ? { scope: { label: "Group", region: null } } : { branch: branch === CO01B_COMBINED_LABEL ? "CO01B" : branch }),
          }}
        >
          {label}
        </VpMetricButton>
      )}
    </div>
  );
}

const REGION_ORDER: RegionName[] = Object.keys(REGIONS) as RegionName[];

function regionSort(a: BranchReport, b: BranchReport): number {
  const ra = regionForBranch(a.branch);
  const rb = regionForBranch(b.branch);
  const ia = ra ? REGION_ORDER.indexOf(ra) : REGION_ORDER.length;
  const ib = rb ? REGION_ORDER.indexOf(rb) : REGION_ORDER.length;
  if (ia !== ib) return ia - ib;
  return a.branch.localeCompare(b.branch);
}

/** Null unless at least one of `codes` has a real figure — same convention as sumField/sumBpuRevenue elsewhere. */
function combinedActual(branches: BranchReport[], codes: readonly string[]): number | null {
  let total = 0;
  let found = false;
  for (const b of branches) {
    if (!codes.includes(b.branch) || b.totalRevenueStreamMtd === null) continue;
    total += b.totalRevenueStreamMtd;
    found = true;
  }
  return found ? total : null;
}

const ALL_BRANCHES_LABEL = "All branches";
const CO01B_COMBINED_LABEL = "CO01B + CO01E";

function slabColumn(
  slabKey: keyof IncentiveSlabTargets,
  label: string,
  targetsByBranch: Record<string, IncentiveSlabTargets>,
  group: VpScopeMetrics,
  date: string,
  holidays: ReadonlySet<string>
): SectionColumn {
  return {
    label,
    render: (row) => {
      const targets = row.branch === ALL_BRANCHES_LABEL ? group.incentiveSlabs : targetsByBranch[row.branch];
      return <SlabCell target={targets?.[slabKey]} actual={row.totalRevenueStreamMtd} metric={slabKey} branch={row.branch} date={date} holidays={holidays} />;
    },
  };
}

export function VpBranchSlabTable({
  branches,
  group,
  incentiveSlabTargets,
  date,
  holidays,
}: {
  branches: BranchReport[];
  group: VpScopeMetrics;
  incentiveSlabTargets: Record<string, IncentiveSlabTargets>;
  date: string;
  /** HQ-flagged report_holidays, as plain strings — same convention as IncentiveSlabIndicator's `holidays` prop. */
  holidays: string[];
}) {
  const targetsByBranch: Record<string, IncentiveSlabTargets> = { ...incentiveSlabTargets };
  const combinedTargets = aggregateIncentiveSlabTargets(incentiveSlabTargets, CO01B_SLAB_COMBINED_BRANCHES);
  if (combinedTargets) targetsByBranch[CO01B_COMBINED_LABEL] = combinedTargets;
  const holidaySet = new Set(holidays);

  const columns: SectionColumn[] = [
    slabColumn("slab1", "Slab 1", targetsByBranch, group, date, holidaySet),
    slabColumn("slab2", "Slab 2", targetsByBranch, group, date, holidaySet),
    slabColumn("slab3", "Slab 3", targetsByBranch, group, date, holidaySet),
    slabColumn("slab4", "Slab 4", targetsByBranch, group, date, holidaySet),
  ];

  const rows = branches
    .filter((b) => b.branch !== "CO01E")
    .sort(regionSort)
    .map((b) => (b.branch === "CO01B" ? { ...b, branch: CO01B_COMBINED_LABEL, totalRevenueStreamMtd: combinedActual(branches, CO01B_SLAB_COMBINED_BRANCHES) } : b));
  const totalRow: BranchReport = { ...rows[0], branch: ALL_BRANCHES_LABEL, totalRevenueStreamMtd: group.totalRevenueStreamMtd };
  const withTotal = rows.length > 0 ? [totalRow, ...rows] : rows;

  return (
    <SectionTable
      title="Incentive Slab Targets — per branch"
      subtitle="Target and % achievement for each slab, graded against Total Revenue Stream — colour reflects month-end pace, solid green once actually achieved, dashed green while on pace"
      branches={withTotal}
      columns={columns}
      scroll={false}
      roomy
      renderBranchCell={(row) => <VpBranchLabel label={row.branch} />}
    />
  );
}
