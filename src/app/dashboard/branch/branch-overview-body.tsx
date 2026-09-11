import type { BranchView } from "@/lib/branch-view-data";
import { formatCompactCurrency } from "@/lib/format";
import { eyebrow } from "@/lib/ui";
import { HeroKpi } from "../hero-kpi";
import { TrendChart } from "../trend-chart";
import { BranchHero } from "./branch-hero";
import { BranchTargets } from "./branch-targets";
import { VasGauge } from "./vas-gauge";
import { MiniLeaderboard } from "./mini-leaderboard";
import { CondensedMetrics } from "./condensed-metrics";

function SinceLastUpload({ view }: { view: BranchView }) {
  const { sinceLastUpload: s } = view;
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <span className={eyebrow}>{s.label}</span>
        <span className="text-sm text-fg-subtle">
          Revenue booked <span className="font-semibold tabular-nums text-fg">{formatCompactCurrency(s.revenue)}</span>
        </span>
        <span className="text-sm text-fg-subtle">
          VAS Bill booked <span className="font-semibold tabular-nums text-fg">{formatCompactCurrency(s.vasBill)}</span>
        </span>
      </div>
    </div>
  );
}

/** The full branch-first stack for one branch. Rendered as the whole page
 * for a branch account, and once per expanded card in a regional manager's
 * grid — so it takes only a `BranchView` and stays presentational. */
export function BranchOverviewBody({ view, date }: { view: BranchView; date: string }) {
  const todayHeader = view.daysSincePrevious === null || view.daysSincePrevious === 1 ? "Today" : `Last ${view.daysSincePrevious}d`;

  return (
    <div className="space-y-4">
      <SinceLastUpload view={view} />

      <BranchHero view={view} />

      <BranchTargets stats={view.targetStats} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendChart
          seriesByMetric={{ total: view.trend.total, vas: view.trend.vas }}
          metrics={[
            { key: "total", label: "Total Revenue Stream (Rs)" },
            { key: "vas", label: "VAS Bill (Rs)" },
          ]}
          compactCurrency
        />
        <VasGauge view={view} date={date} />
      </div>

      <MiniLeaderboard leaderboards={view.leaderboards} />

      <HeroKpi branches={view.allBranches} compact pinnedBranch={view.branch} />

      <CondensedMetrics report={view.report} allBranches={view.allBranches} todayHeader={todayHeader} />
    </div>
  );
}
