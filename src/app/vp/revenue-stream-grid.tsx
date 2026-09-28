import type { ReactNode } from "react";
import { achievementTone, filterBranchesByRegion } from "@/lib/aggregate";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { RegionName } from "@/lib/regions";
import type { BranchReport } from "@/lib/report";
import type { VpScopeMetrics } from "@/lib/vp-data";
import { tglossText } from "@/components/tgloss-text";
import { LABOUR_PER_RO_BANDS, PARTS_PER_RO_BANDS, type Band } from "../dashboard/revenue-per-vehicle-table";
import { IncentiveSlabIndicator } from "../dashboard/incentive-slab-indicator";
import { ScopeBreakdownCell } from "./external-sales-cell";
import { softBandClassName } from "./vp-band-colors";
import { VpMetricButton } from "./vp-compare";
import type { MetricKey } from "./vp-metrics";

const REGION_COLOR: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

const TONE_TEXT = { good: "text-good", warn: "text-warn", critical: "text-bad", neutral: "text-fg" } as const;

type Row =
  | { kind: "section"; label: string }
  | { kind: "hero"; label: ReactNode; sub: string; get: (s: VpScopeMetrics) => string; detail: DetailSpec }
  | {
      kind: "metric";
      label: ReactNode;
      sub?: string;
      get: (s: VpScopeMetrics) => string;
      /** Makes each scope's figure clickable — opens the ranked-branches detail (vp-metric-detail.tsx). */
      detail?: DetailSpec;
      tone?: (s: VpScopeMetrics) => keyof typeof TONE_TEXT;
      /** Renders this row as a coloured band (green/yellow/orange/red)
       * instead of plain text — the same thresholds and colours as the
       * Regions page's Revenue Per Vehicle table (2026-09-25, at the VP's
       * request for a consistent read at a glance across both pages). Needs
       * the raw ratio separately from `get`, which returns the already
       * -formatted display string. */
      band?: { value: (s: VpScopeMetrics) => number | null; bands: Band[] };
    }
  | { kind: "slabs" }
  | {
      /** Click a scope's cell to see the branches behind that total, ranked
       * by their own contribution — for rows with no natural per-car
       * denominator to band against (External Sales, 2026-09-25). */
      kind: "scopeBreakdown";
      label: ReactNode;
      metricLabel: string;
      value: (s: VpScopeMetrics) => number | null;
      branchValue: (b: BranchReport) => number | null;
    };

type DetailSpec = { metric: MetricKey; value: (s: VpScopeMetrics) => number | null };

const ROWS: Row[] = [
  { kind: "section", label: "Revenue Stream" },
  {
    kind: "hero",
    label: "Total Revenue Stream · MTD",
    sub: "GUS + BPU parts & labour + External Sales + scrap/used oil",
    get: (s) => formatCompactCurrency(s.totalRevenueStreamMtd),
    detail: { metric: "totalRevenue", value: (s) => s.totalRevenueStreamMtd },
  },

  { kind: "section", label: "GUS · General Service" },
  { kind: "metric", label: "GUS Parts · MTD", get: (s) => formatCompactCurrency(s.gusPartsMtd), detail: { metric: "gusParts", value: (s) => s.gusPartsMtd } },
  { kind: "metric", label: "GUS Labour · MTD", get: (s) => formatCompactCurrency(s.gusLabourMtd), detail: { metric: "gusLabour", value: (s) => s.gusLabourMtd } },
  {
    kind: "metric",
    label: "GUS Parts / car",
    sub: "Parts MTD ÷ GUS RO MTD",
    get: (s) => formatCompactCurrency(s.gusPartsPerCar),
    band: { value: (s) => s.gusPartsPerCar, bands: PARTS_PER_RO_BANDS },
    detail: { metric: "gusPartsPerCar", value: (s) => s.gusPartsPerCar },
  },
  {
    kind: "metric",
    label: "GUS Labour / car",
    sub: "Labour MTD ÷ GUS RO MTD",
    get: (s) => formatCompactCurrency(s.gusLabourPerCar),
    band: { value: (s) => s.gusLabourPerCar, bands: LABOUR_PER_RO_BANDS },
    detail: { metric: "gusLabourPerCar", value: (s) => s.gusLabourPerCar },
  },
  { kind: "metric", label: "GUS RO · MTD", get: (s) => formatNumber(s.gusRoMtd), detail: { metric: "gusRo", value: (s) => s.gusRoMtd } },

  { kind: "section", label: "BPU · Body & Paint" },
  {
    kind: "metric",
    label: "BPU Revenue · MTD — BP-only branches",
    sub: "CO01E, KL01B, TR01B",
    get: (s) => formatCompactCurrency(s.bpuRevenueBodyPaintOnlyMtd),
  },
  {
    kind: "metric",
    label: "BPU Revenue · MTD — other branches",
    sub: "BPU line at every GUS+BPU branch",
    get: (s) => formatCompactCurrency(s.bpuRevenueOtherMtd),
  },
  { kind: "metric", label: "BPU RO · MTD", get: (s) => formatNumber(s.bpuRoMtd), detail: { metric: "bpuRo", value: (s) => s.bpuRoMtd } },

  { kind: "section", label: "TGLOSS" },
  { kind: "metric", label: tglossText("TGLOSS · MTD"), get: (s) => formatCompactCurrency(s.tglossMtd), detail: { metric: "tglossMtd", value: (s) => s.tglossMtd } },
  { kind: "metric", label: tglossText("TGLOSS Target"), get: (s) => formatCompactCurrency(s.tglossTarget) },
  {
    kind: "metric",
    label: tglossText("TGLOSS Achievement"),
    get: (s) => formatPercent(s.tglossPct),
    tone: (s) => achievementTone(s.tglossPct),
    detail: { metric: "tglossPct", value: (s) => s.tglossPct },
  },

  { kind: "section", label: "Other Revenue" },
  {
    kind: "scopeBreakdown",
    label: "External Sales · MTD",
    metricLabel: "External Sales · MTD",
    value: (s) => s.externalSalesMtd,
    branchValue: (b) => b.externalSalesMtd,
  },
  { kind: "metric", label: "Scrap & Used Oil · MTD", get: (s) => formatCompactCurrency(s.scrapAndUsedOilMtd) },

  { kind: "section", label: "Incentive Target Slabs" },
  { kind: "slabs" },
];

/** A scope's figure — a button that opens the ranked-branches detail when the row has one, plain text otherwise. */
function ScopeFigure({ spec, scope, className, children }: { spec?: DetailSpec; scope: VpScopeMetrics; className?: string; children: ReactNode }) {
  const value = spec ? spec.value(scope) : null;
  if (!spec || value === null) return className ? <div className={className}>{children}</div> : <>{children}</>;
  return (
    <VpMetricButton className={className} target={{ metric: spec.metric, value, scope: { label: scope.label, region: scope.region ?? null } }}>
      {children}
    </VpMetricButton>
  );
}

function ColumnHeader({ scope, className }: { scope: VpScopeMetrics; className?: string }) {
  const dot = scope.region ? (
    <span className="h-2.5 w-2.5 rounded-full" style={{ background: REGION_COLOR[scope.region] }} />
  ) : (
    <span className="h-2.5 w-2.5 rounded-full bg-accent" />
  );
  const inner = (
    <span className="inline-flex items-center gap-1.5">
      {dot}
      {scope.label}
    </span>
  );
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] ${scope.region ? "text-fg-subtle" : "text-fg"} ${className ?? ""}`}
    >
      {inner}
    </th>
  );
}

/**
 * The Executive Overview's main revenue-stream grid (2026-09-25, replacing
 * the old hero-card strip + VpScoreboard) — Group and the 3 regions as
 * columns, every metric the VP asked to see as a row, in the order they
 * gave it: Total Revenue Stream first, then GUS Parts/Labour MTD (their
 * most important figures) with the per-car breakdown, BPU revenue split
 * between Body & Paint-only branches and everyone else's own BPU line, RO
 * MTD, TGLOSS, External Sales, Scrap & Used Oil, and the incentive slab
 * rings — explicitly no "for the day" or MoM/YoY figures, per the VP brief.
 * External Sales · MTD is clickable per scope (2026-09-25) — since these
 * columns are scopes, not branches, it opens a branch-contribution
 * breakdown rather than the rank-vs-company-wide modal GUS/BPU/TGLOSS use
 * on the Regions page (see external-sales-cell.tsx).
 */
export function RevenueStreamGrid({ scopes, branches, date }: { scopes: VpScopeMetrics[]; branches: BranchReport[]; date: string }) {
  return (
    // Scrolls with the page now (2026-09-28, at the VP's request — a capped
    // height + frozen header here, stacked with two more of the same on the
    // Regions section below, made the page feel like a stack of small boxed
    // windows rather than one page). overflow-x-auto (not overflow-auto) is
    // kept deliberately — this table is min-w-[720px] and needs to scroll
    // horizontally on a narrow viewport; dropping it entirely would let the
    // table force the whole page wider instead.
    <div className="overflow-clip rounded-2xl border border-border-subtle bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-subtle">
            <th scope="col" className="sticky top-14 z-10 bg-surface-2 px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-faint">
              Metric
            </th>
            {scopes.map((s, i) => (
              <ColumnHeader key={s.label} scope={s} className={`sticky top-14 z-10 bg-surface-2 ${i === 1 ? "border-l border-border-subtle" : ""}`} />
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, i) => {
            if (row.kind === "section") {
              return (
                <tr key={i} className="border-t border-border-subtle bg-surface-2/60">
                  <td colSpan={scopes.length + 1} className="px-5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-faint">
                    {row.label}
                  </td>
                </tr>
              );
            }

            if (row.kind === "hero") {
              return (
                <tr key={i} className="border-t border-border-subtle bg-accent-soft/40">
                  <td className="px-5 py-4">
                    <div className="text-sm font-semibold text-fg">{row.label}</div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-fg-faint">{row.sub}</div>
                  </td>
                  {scopes.map((s, ci) => (
                    <td key={s.label} className={`px-4 py-4 text-right text-xl font-semibold tabular-nums tracking-tight text-fg ${ci === 1 ? "border-l border-border-subtle" : ""}`}>
                      <ScopeFigure spec={row.detail} scope={s}>
                        {row.get(s)}
                      </ScopeFigure>
                    </td>
                  ))}
                </tr>
              );
            }

            if (row.kind === "scopeBreakdown") {
              return (
                <tr key={i} className="border-t border-border-subtle">
                  <td className="px-5 py-3">
                    <div className="text-[13px] font-medium text-fg">{row.label}</div>
                  </td>
                  {scopes.map((s, ci) => {
                    const value = row.value(s);
                    const scopeBranches = s.region ? filterBranchesByRegion(branches, s.region) : branches;
                    return (
                      <td key={s.label} className={`px-4 py-3 text-right ${ci === 1 ? "border-l border-border-subtle" : ""}`}>
                        {value === null ? (
                          <span className="text-sm text-fg-faint">—</span>
                        ) : (
                          <ScopeBreakdownCell
                            scopeLabel={s.label}
                            metricLabel={row.metricLabel}
                            value={value}
                            branches={scopeBranches.map((b) => ({ branch: b.branch, value: row.branchValue(b) }))}
                            className="ml-auto flex h-8 w-fit min-w-[5.5rem] items-center justify-end rounded px-2 text-sm font-semibold tabular-nums text-fg transition-transform hover:scale-105 hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            }

            if (row.kind === "slabs") {
              return (
                <tr key={i} className="border-t border-border-subtle">
                  <td className="px-5 py-4 align-top text-[13px] font-medium text-fg">
                    Progress toward this month&apos;s slab targets, graded against Total Revenue Stream.
                  </td>
                  {scopes.map((s, ci) => (
                    <td key={s.label} className={`px-4 py-3 ${ci === 1 ? "border-l border-border-subtle" : ""}`}>
                      <div className="flex justify-end">
                        <IncentiveSlabIndicator scopeLabel={s.label} actual={s.totalRevenueStreamMtd} slabs={s.incentiveSlabs} date={date} size={72} showActual={false} />
                      </div>
                    </td>
                  ))}
                </tr>
              );
            }

            return (
              <tr key={i} className="border-t border-border-subtle">
                <td className="px-5 py-3">
                  <div className="text-[13px] font-medium text-fg">{row.label}</div>
                  {row.sub ? <div className="text-[10.5px] leading-tight text-fg-faint">{row.sub}</div> : null}
                </td>
                {scopes.map((s, ci) => {
                  if (row.band) {
                    return (
                      <td key={s.label} className={`px-4 py-3 text-right ${ci === 1 ? "border-l border-border-subtle" : ""}`}>
                        <ScopeFigure
                          spec={row.detail}
                          scope={s}
                          className={`ml-auto flex h-7 w-fit min-w-24 items-center justify-center rounded px-2 text-sm font-semibold tabular-nums ${softBandClassName(row.band.value(s), row.band.bands)}`}
                        >
                          {row.get(s)}
                        </ScopeFigure>
                      </td>
                    );
                  }
                  const tone = row.tone?.(s) ?? "neutral";
                  return (
                    <td
                      key={s.label}
                      className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${TONE_TEXT[tone]} ${ci === 1 ? "border-l border-border-subtle" : ""}`}
                    >
                      <ScopeFigure spec={row.detail} scope={s} className="rounded px-1 hover:text-accent-text">
                        {row.get(s)}
                      </ScopeFigure>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
