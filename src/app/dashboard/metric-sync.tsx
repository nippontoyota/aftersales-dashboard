"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Shared metric selection for the cards that carry a metric <select> (Trend
 * Chart, Achievement Donut, Region Scorecard). On the main Executive
 * Overview each shows a single metric with no dropdown and no provider, so
 * they fall back to their own local state and nothing changes. The TKM
 * Targets page wraps its trio in <MetricSyncProvider> so picking BPU (or any
 * metric) in one dropdown switches all three at once — confirmed with the
 * user 2026-09-07. Not persisted to the URL: resets to the first metric on
 * each load, same as before.
 */
type MetricSync = { metric: string; setMetric: (value: string) => void };

const MetricSyncContext = createContext<MetricSync | null>(null);

export function MetricSyncProvider({ initialMetric, children }: { initialMetric: string; children: ReactNode }) {
  const [metric, setMetric] = useState(initialMetric);
  return <MetricSyncContext.Provider value={{ metric, setMetric }}>{children}</MetricSyncContext.Provider>;
}

/** `[metric, setMetric]` from the surrounding MetricSyncProvider if there is
 * one, otherwise a private `useState` seeded with `fallback`. */
export function useSyncedMetric(fallback: string): [string, (value: string) => void] {
  const shared = useContext(MetricSyncContext);
  const local = useState(fallback);
  return shared ? [shared.metric, shared.setMetric] : local;
}
