import type { BranchReport } from "./report";
import { REGIONS, type RegionName } from "./regions";

export function filterBranchesByRegion(branches: BranchReport[], region: RegionName | "All"): BranchReport[] {
  if (region === "All") return branches;
  const codes: readonly string[] = REGIONS[region];
  return branches.filter((b) => codes.includes(b.branch));
}

type NumericBranchReportKey = {
  [K in keyof BranchReport]-?: BranchReport[K] extends number | null ? K : never;
}[keyof BranchReport];

function sumField(branches: BranchReport[], key: NumericBranchReportKey): number | null {
  let total = 0;
  let found = false;
  for (const b of branches) {
    const v = b[key];
    if (typeof v === "number") {
      total += v;
      found = true;
    }
  }
  return found ? total : null;
}

/** Percentage-shaped fields must be averaged, never summed — summing a
 * penetration % across branches would produce a meaningless number. */
function avgField(branches: BranchReport[], key: NumericBranchReportKey): number | null {
  const values = branches.map((b) => b[key]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Headline KPI strip — one field per tile shown on the dashboard. */
export type KpiSummary = {
  gusRoMtd: number | null;
  bpuRoMtd: number | null;
  cpuAchievementForTheMonth: number | null;
  offtakeAchievementForTheMonth: number | null;
  offtakeTarget: number | null;
  partsRetailAchievementForTheMonth: number | null;
  partsRetailTarget: number | null;
  bpuAchievementForTheMonth: number | null;
  bpuTarget: number | null;
  pmOcAchievementForTheMonth: number | null;
  pmOcTarget: number | null;
  vasBillTarget: number | null;
  vasAchievementForTheMonth: number | null;
  /** Averaged across branches, not summed — see avgField. */
  penetrationTGlossService: number | null;
  gusPartsMtd: number | null;
  gusLabourMtd: number | null;
  bpuPartsMtd: number | null;
  bpuLabourMtd: number | null;
  externalSalesMtd: number | null;
  /** Averaged across branches, not summed — see avgField. */
  externalSalesPctOfSprInternal: number | null;
};

export function computeKpiSummary(branches: BranchReport[]): KpiSummary {
  return {
    gusRoMtd: sumField(branches, "gusRoMtd"),
    bpuRoMtd: sumField(branches, "bpuRoMtd"),
    cpuAchievementForTheMonth: sumField(branches, "cpuAchievementForTheMonth"),
    offtakeAchievementForTheMonth: sumField(branches, "offtakeAchievementForTheMonth"),
    offtakeTarget: sumField(branches, "offtakeTarget"),
    partsRetailAchievementForTheMonth: sumField(branches, "partsRetailAchievementForTheMonth"),
    partsRetailTarget: sumField(branches, "partsRetailTarget"),
    bpuAchievementForTheMonth: sumField(branches, "bpuAchievementForTheMonth"),
    bpuTarget: sumField(branches, "bpuTarget"),
    pmOcAchievementForTheMonth: sumField(branches, "pmOcAchievementForTheMonth"),
    pmOcTarget: sumField(branches, "pmOcTarget"),
    vasBillTarget: sumField(branches, "vasBillTarget"),
    vasAchievementForTheMonth: sumField(branches, "vasAchievementForTheMonth"),
    penetrationTGlossService: avgField(branches, "penetrationTGlossService"),
    gusPartsMtd: sumField(branches, "gusPartsMtd"),
    gusLabourMtd: sumField(branches, "gusLabourMtd"),
    bpuPartsMtd: sumField(branches, "bpuPartsMtd"),
    bpuLabourMtd: sumField(branches, "bpuLabourMtd"),
    externalSalesMtd: sumField(branches, "externalSalesMtd"),
    externalSalesPctOfSprInternal: avgField(branches, "externalSalesPctOfSprInternal"),
  };
}

/** GUS/BPU headline figures — the dealer group's two most important revenue
 * lines, shown as their own hero section broken out by region (see
 * dashboard/page.tsx and hero-kpi.tsx), separate from the rest of the KPI strip. */
export type HeroSummary = {
  gusRoBilledForTheDay: number | null;
  gusRoMtd: number | null;
  gusPartsMtd: number | null;
  gusLabourMtd: number | null;
  bpuRoBilledForTheDay: number | null;
  bpuRoMtd: number | null;
  bpuPartsMtd: number | null;
  bpuLabourMtd: number | null;
  externalSalesMtd: number | null;
  /** Averaged across branches, not summed — same convention as KpiSummary's field of the same name (see avgField). */
  externalSalesPctOfSprInternal: number | null;
  /** Scrap / used-oil bill revenue (Rs, without tax), MTD — summed across branches. Always a number (0 when no bills). */
  scrapRevenueMtd: number | null;
  usedOilRevenueMtd: number | null;
  /** GUS Parts+Labour + BPU Parts+Labour + External Sales + scrap + used oil, MTD — the grand-total figure from the user's Revenue Stream reference, plus bill revenue. */
  totalRevenueStreamMtd: number | null;
};

export function computeHeroSummary(branches: BranchReport[]): HeroSummary {
  return {
    gusRoBilledForTheDay: sumField(branches, "gusRoBilledForTheDay"),
    gusRoMtd: sumField(branches, "gusRoMtd"),
    gusPartsMtd: sumField(branches, "gusPartsMtd"),
    gusLabourMtd: sumField(branches, "gusLabourMtd"),
    bpuRoBilledForTheDay: sumField(branches, "bpuRoBilledForTheDay"),
    bpuRoMtd: sumField(branches, "bpuRoMtd"),
    bpuPartsMtd: sumField(branches, "bpuPartsMtd"),
    bpuLabourMtd: sumField(branches, "bpuLabourMtd"),
    externalSalesMtd: sumField(branches, "externalSalesMtd"),
    externalSalesPctOfSprInternal: avgField(branches, "externalSalesPctOfSprInternal"),
    scrapRevenueMtd: sumField(branches, "scrapRevenueMtd"),
    usedOilRevenueMtd: sumField(branches, "usedOilRevenueMtd"),
    totalRevenueStreamMtd: sumField(branches, "totalRevenueStreamMtd"),
  };
}

export type AchievementTone = "good" | "warn" | "critical" | "neutral";

export function achievementRatio(actual: number | null, target: number | null): number | null {
  if (actual === null || target === null || target === 0) return null;
  return actual / target;
}

/** ≥100% on/above target, 90-99% behind but close, <90% at-risk. */
export function achievementTone(ratio: number | null): AchievementTone {
  if (ratio === null) return "neutral";
  if (ratio >= 1) return "good";
  if (ratio >= 0.9) return "warn";
  return "critical";
}

/** True when there's a real reported figure but no target to grade it
 * against (target null or 0) — distinct from genuinely no data at all
 * (actual also null). achievementRatio returns null for both cases, so a
 * plain "—" driven off the ratio alone can't tell them apart and a real,
 * non-zero figure quietly renders identically to an empty cell (e.g.
 * CO01C's online-store Offtake: real activity, target not set). Flags that
 * case so a display can show the number instead of hiding it. */
export function hasActualWithoutTarget(actual: number | null, target: number | null): boolean {
  return actual !== null && (target === null || target === 0);
}

const FIXED_TGLOSS_TARGET = 0.38;

export type TrackedKpi = { key: string; label: string; actual: keyof KpiSummary; target: number | keyof KpiSummary };

/** BPU/Offtake/Parts Retail/PM+OC moved to their own "TKM Targets" page
 * (2026-08-31, at the user's request — these are TKM's own official target
 * categories, tracked separately from the rest of the dashboard). Kept in
 * one place so "which KPIs count" for the TKM Targets page can't drift
 * between the views that need this list (Achievement Donut, Trend Chart,
 * Region Scorecard, heatmap, bars, Alerts, Insights all take this as a
 * `metrics`/`trackedKpis` prop rather than hardcoding it). */
export const TKM_TRACKED_KPIS: TrackedKpi[] = [
  { key: "bpu", label: "BPU Achievement", actual: "bpuAchievementForTheMonth", target: "bpuTarget" },
  { key: "offtake", label: "Offtake Achievement", actual: "offtakeAchievementForTheMonth", target: "offtakeTarget" },
  { key: "partsRetail", label: "Parts Retail Achievement", actual: "partsRetailAchievementForTheMonth", target: "partsRetailTarget" },
  { key: "pmOc", label: "PM+OC Achievement", actual: "pmOcAchievementForTheMonth", target: "pmOcTarget" },
];

/** The KPIs with a real, confirmed target that stay on the main dashboard
 * (everything else moved to TKM_TRACKED_KPIS above, 2026-08-31) — used by
 * the Insights panel to know which KPIs to reason about. */
export const TRACKED_KPIS: TrackedKpi[] = [
  { key: "vas", label: "VAS Achievement", actual: "vasAchievementForTheMonth", target: "vasBillTarget" },
  { key: "tGloss", label: "T-Gloss Penetration", actual: "penetrationTGlossService", target: FIXED_TGLOSS_TARGET },
];
