"use client";

import { useMemo } from "react";
import { filterBranchesByRegion } from "@/lib/aggregate";
import { computeVasTrendSeries } from "@/lib/trend";
import type { BranchReport } from "@/lib/report";
import type { Snapshot } from "@/lib/snapshot-store";
import type { ServiceInfoSnapshot } from "@/lib/service-info/store";
import { useSyncedScope } from "./scope-sync";
import { RevenuePerCarLeaderboard } from "./revenue-per-car-leaderboard";
import { TrendChart } from "./trend-chart";

/**
 * Executive Overview's Overview-tab leaderboard and Trends-tab VAS chart,
 * both scoped to whatever ScopeSyncProvider/scope-sync.tsx currently holds
 * (set from the Hero Figures strip) — the two pieces of the page that used
 * to follow the now-removed header region dropdown. Both take the full,
 * unfiltered data and filter/recompute client-side on scope change, same
 * idiom region-scorecard.tsx already uses for its own metric-scoped trend.
 */
export function ScopedRevenuePerCar({ branches, defaultScope }: { branches: BranchReport[]; defaultScope: string }) {
  const [scope] = useSyncedScope(defaultScope);
  const scoped = useMemo(() => filterBranchesByRegion(branches, scope), [branches, scope]);
  return <RevenuePerCarLeaderboard branches={scoped} highlightBranch={null} compact />;
}

export function ScopedVasTrend({
  monthSnapshots,
  serviceInfoMonthSnapshots,
  date,
  defaultScope,
}: {
  monthSnapshots: Snapshot[];
  serviceInfoMonthSnapshots: ServiceInfoSnapshot[];
  date: string;
  defaultScope: string;
}) {
  const [scope] = useSyncedScope(defaultScope);
  const series = useMemo(
    () => computeVasTrendSeries(monthSnapshots, serviceInfoMonthSnapshots, scope),
    [monthSnapshots, serviceInfoMonthSnapshots, scope],
  );
  return <TrendChart seriesByMetric={{ vas: series }} date={date} />;
}
