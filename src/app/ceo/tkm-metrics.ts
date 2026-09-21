import type { HeatmapMetricConfig } from "../dashboard/branch-performance-heatmap";
import type { RegionMetricConfig } from "../dashboard/region-scorecard";
import type { TrendMetricConfig } from "../dashboard/trend-chart";

/**
 * BPU/Offtake/Parts Retail/PM+OC/Tyre/Battery for the CEO view — same six
 * TKM-tracked target categories as /tkm-targets' four, plus Tyre and Battery
 * promoted to full target-graded metrics here (they have real targets in the
 * data; /tkm-targets currently shows them as plain figures only, a deliberate
 * choice made there 2026-09-21 that this page doesn't need to match).
 * Kept local to /ceo rather than shared with /tkm-targets so a future change
 * to one doesn't silently affect the other.
 */

export const CEO_TREND_METRICS: TrendMetricConfig[] = [
  { key: "partsRetail", label: "Parts Retail (SPR)", isCurrency: true },
  { key: "bpu", label: "BPU" },
  { key: "offtake", label: "Offtake (SPO)", isCurrency: true },
  { key: "pmOc", label: "PM+OC" },
  { key: "tyre", label: "Tyre" },
  { key: "battery", label: "Battery" },
];

export const CEO_REGION_METRICS: RegionMetricConfig[] = [
  { key: "partsRetail", label: "Parts Retail (Rs)", actual: "partsRetailAchievementForTheMonth", target: "partsRetailTarget", baToolActual: "sprInternal", baToolTarget: "sprInternalTarget", isCurrency: true },
  { key: "bpu", label: "BPU", actual: "bpuAchievementForTheMonth", target: "bpuTarget", baToolActual: "bpus", baToolTarget: "bpusTarget", isCurrency: false },
  { key: "offtake", label: "Offtake (Rs)", actual: "offtakeAchievementForTheMonth", target: "offtakeTarget", baToolActual: "spoDealer", baToolTarget: "spoDealerTarget", isCurrency: true },
  { key: "pmOc", label: "PM+OC", actual: "pmOcAchievementForTheMonth", target: "pmOcTarget", baToolActual: "pm", baToolTarget: "pmTarget", isCurrency: false },
  { key: "tyre", label: "Tyre", actual: "tireSalesForTheMonth", target: "tireTarget", baToolActual: "tyreActual", baToolTarget: "tyreTarget", isCurrency: false },
  { key: "battery", label: "Battery", actual: "batterySalesForTheMonth", target: "batteryTarget", baToolActual: "batteryActuals", baToolTarget: "batteryTarget", isCurrency: false },
];

export const CEO_HEATMAP_METRICS: HeatmapMetricConfig[] = [
  { label: "Parts Retail", actual: "partsRetailAchievementForTheMonth", target: "partsRetailTarget", syncKey: "partsRetail", baToolActual: "sprInternal", baToolTarget: "sprInternalTarget" },
  { label: "BPU Ach.", actual: "bpuAchievementForTheMonth", target: "bpuTarget", syncKey: "bpu", baToolActual: "bpus", baToolTarget: "bpusTarget" },
  { label: "Offtake", actual: "offtakeAchievementForTheMonth", target: "offtakeTarget", syncKey: "offtake", baToolActual: "spoDealer", baToolTarget: "spoDealerTarget" },
  { label: "PM+OC", actual: "pmOcAchievementForTheMonth", target: "pmOcTarget", syncKey: "pmOc", baToolActual: "pm", baToolTarget: "pmTarget" },
  { label: "Tyre", actual: "tireSalesForTheMonth", target: "tireTarget", syncKey: "tyre", baToolActual: "tyreActual", baToolTarget: "tyreTarget" },
  { label: "Battery", actual: "batterySalesForTheMonth", target: "batteryTarget", syncKey: "battery", baToolActual: "batteryActuals", baToolTarget: "batteryTarget" },
];
