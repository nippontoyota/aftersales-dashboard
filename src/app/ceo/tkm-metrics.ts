import type { HeatmapMetricConfig } from "../dashboard/branch-performance-heatmap";

/**
 * BPU/Offtake/Parts Retail/PM+OC/Tyre/Battery for the CEO view's branch
 * heatmap — same six TKM-tracked target categories as /tkm-targets' four,
 * plus Tyre and Battery promoted to full target-graded metrics here (they
 * have real targets in the data; /tkm-targets currently shows them as plain
 * figures only, a deliberate choice made there 2026-09-21 that this page
 * doesn't need to match). Kept local to /ceo rather than shared with
 * /tkm-targets so a future change to one doesn't silently affect the other.
 *
 * The CEO page's own trend chart and region scorecard (which used to use
 * this file's since-removed CEO_TREND_METRICS/CEO_REGION_METRICS) were
 * dropped 2026-10-01 at the user's request, leaving just the heatmap below.
 */
export const CEO_HEATMAP_METRICS: HeatmapMetricConfig[] = [
  { label: "Parts Retail", actual: "partsRetailAchievementForTheMonth", target: "partsRetailTarget", syncKey: "partsRetail", baToolActual: "sprInternal", baToolTarget: "sprInternalTarget" },
  { label: "BPU Ach.", actual: "bpuAchievementForTheMonth", target: "bpuTarget", syncKey: "bpu", baToolActual: "bpus", baToolTarget: "bpusTarget" },
  { label: "Offtake", actual: "offtakeAchievementForTheMonth", target: "offtakeTarget", syncKey: "offtake", baToolActual: "spoDealer", baToolTarget: "spoDealerTarget" },
  { label: "PM+OC", actual: "pmOcAchievementForTheMonth", target: "pmOcTarget", syncKey: "pmOc", baToolActual: "pm", baToolTarget: "pmTarget" },
  { label: "Tyre", actual: "tireSalesForTheMonth", target: "tireTarget", syncKey: "tyre", baToolActual: "tyreActual", baToolTarget: "tyreTarget" },
  { label: "Battery", actual: "batterySalesForTheMonth", target: "batteryTarget", syncKey: "battery", baToolActual: "batteryActuals", baToolTarget: "batteryTarget" },
];
