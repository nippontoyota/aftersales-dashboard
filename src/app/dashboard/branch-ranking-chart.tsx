"use client";

import { useState } from "react";
import type { BranchReport } from "@/lib/report";
import { regionForBranch, type RegionName } from "@/lib/regions";
import { formatNumber } from "@/lib/format";
import { CollapsibleCard } from "@/components/collapsible-card";

type MetricKey =
  | "gusRoMtd"
  | "bpuRoMtd"
  | "cpuAchievementForTheMonth"
  | "bpuAchievementForTheMonth"
  | "offtakeAchievementForTheMonth"
  | "partsRetailAchievementForTheMonth"
  | "pmOcAchievementForTheMonth"
  | "vasAchievementForTheMonth"
  | "wheelBalancingMtd"
  | "wheelAlignmentMtd"
  | "brakeSkimmingMtd"
  | "evaporatorCleaningMtd"
  | "engineFlushMtd"
  | "injectorCleanerMtd"
  | "syntheticOilMtd"
  | "brakeCleaningSprayMtd"
  | "gusPartsMtd"
  | "gusLabourMtd"
  | "bpuPartsMtd"
  | "bpuLabourMtd"
  | "externalSalesMtd"
  | "totalRevenueStreamMtd";

export type RankingMetricConfig = { key: MetricKey; label: string };

/** CPU/BPU/Offtake/Parts Retail/PM+OC Achievement moved to their own
 * ranking on the TKM Targets page (2026-08-31) — this default is what's
 * left on the main dashboard's ranking. */
const DEFAULT_METRICS: RankingMetricConfig[] = [
  { key: "gusRoMtd", label: "GUS RO MTD" },
  { key: "gusPartsMtd", label: "GUS Parts MTD (Rs)" },
  { key: "gusLabourMtd", label: "GUS Labour MTD (Rs)" },
  { key: "bpuRoMtd", label: "BPU RO MTD" },
  { key: "bpuPartsMtd", label: "BPU Parts MTD (Rs)" },
  { key: "bpuLabourMtd", label: "BPU Labour MTD (Rs)" },
  { key: "wheelBalancingMtd", label: "Wheel Balancing MTD" },
  { key: "wheelAlignmentMtd", label: "Wheel Alignment MTD" },
  { key: "brakeSkimmingMtd", label: "Brake Skimming MTD" },
  { key: "engineFlushMtd", label: "Engine Flush MTD" },
  { key: "evaporatorCleaningMtd", label: "Evaporator Cleaning MTD" },
  { key: "injectorCleanerMtd", label: "Injector Cleaner MTD" },
  { key: "syntheticOilMtd", label: "Synthetic Oil (Ltrs) MTD" },
  { key: "brakeCleaningSprayMtd", label: "Brake Cleaning Spray MTD" },
  { key: "vasAchievementForTheMonth", label: "VAS Achievement MTD (Rs)" },
  { key: "externalSalesMtd", label: "External Sales MTD (Rs)" },
  { key: "totalRevenueStreamMtd", label: "Total Revenue Stream MTD (Rs)" },
];

/** The TKM Targets page's own ranking — CPU/BPU/Offtake/Parts Retail/PM+OC Achievement MTD. */
export const TKM_RANKING_METRICS: RankingMetricConfig[] = [
  { key: "cpuAchievementForTheMonth", label: "CPU Achievement MTD" },
  { key: "bpuAchievementForTheMonth", label: "BPU Achievement MTD" },
  { key: "offtakeAchievementForTheMonth", label: "Offtake Achievement MTD (Rs)" },
  { key: "partsRetailAchievementForTheMonth", label: "Parts Retail Achievement MTD (Rs)" },
  { key: "pmOcAchievementForTheMonth", label: "PM+OC Achievement MTD" },
];

// Same validated categorical hues used for the region grouping everywhere else.
const REGION_COLOR: Record<RegionName, string> = {
  Central: "#2a78d6",
  South: "#eb6834",
  North: "#1baf7a",
};

export function BranchRankingChart({
  branches,
  metrics = DEFAULT_METRICS,
  defaultOpen = false,
}: {
  branches: BranchReport[];
  /** Defaults to the main dashboard's own set; the TKM Targets page passes TKM_RANKING_METRICS instead. */
  metrics?: RankingMetricConfig[];
  defaultOpen?: boolean;
}) {
  const [metricKey, setMetricKey] = useState<MetricKey>(metrics[0]?.key ?? "gusRoMtd");

  const rows = branches
    .map((b) => ({ branch: b.branch, value: b[metricKey] ?? 0, region: regionForBranch(b.branch) }))
    .sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <CollapsibleCard title="Branch ranking" defaultOpen={defaultOpen}>
      <div className="p-4">
        <select
          value={metricKey}
          onChange={(e) => setMetricKey(e.target.value as MetricKey)}
          className="h-7 rounded border border-slate-300 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          {metrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>

        <div className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.branch}
              className="flex items-center gap-2"
              title={`${r.branch}${r.region ? ` (${r.region})` : ""} — ${metrics.find((m) => m.key === metricKey)?.label}: ${formatNumber(r.value)}`}
            >
              <div className="w-16 shrink-0 text-xs font-medium text-slate-700">{r.branch}</div>
              <div className="h-4 flex-1 overflow-hidden rounded-sm bg-slate-100">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${(r.value / max) * 100}%`,
                    backgroundColor: r.region ? REGION_COLOR[r.region] : "#94a3b8",
                  }}
                />
              </div>
              <div className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-600">{formatNumber(r.value)}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3 border-t border-dashed border-slate-200 pt-2 text-[11px] text-slate-500">
          {(Object.keys(REGION_COLOR) as RegionName[]).map((region) => (
            <span key={region} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: REGION_COLOR[region] }} />
              {region}
            </span>
          ))}
        </div>
      </div>
    </CollapsibleCard>
  );
}
