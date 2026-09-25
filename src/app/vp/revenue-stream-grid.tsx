import type { ReactNode } from "react";
import { achievementTone } from "@/lib/aggregate";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { RegionName } from "@/lib/regions";
import type { VpScopeMetrics } from "@/lib/vp-data";
import { tglossText } from "@/components/tgloss-text";
import { bandClassName, LABOUR_PER_RO_BANDS, PARTS_PER_RO_BANDS, type Band } from "../dashboard/revenue-per-vehicle-table";
import { IncentiveSlabIndicator } from "../dashboard/incentive-slab-indicator";

const REGION_COLOR: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

const TONE_TEXT = { good: "text-good", warn: "text-warn", critical: "text-bad", neutral: "text-fg" } as const;

type Row =
  | { kind: "section"; label: string }
  | { kind: "hero"; label: ReactNode; sub: string; get: (s: VpScopeMetrics) => string }
  | {
      kind: "metric";
      label: ReactNode;
      sub?: string;
      get: (s: VpScopeMetrics) => string;
      tone?: (s: VpScopeMetrics) => keyof typeof TONE_TEXT;
      /** Renders this row as a coloured band (green/yellow/orange/red)
       * instead of plain text — the same thresholds and colours as the
       * Regions page's Revenue Per Vehicle table (2026-09-25, at the VP's
       * request for a consistent read at a glance across both pages). Needs
       * the raw ratio separately from `get`, which returns the already
       * -formatted display string. */
      band?: { value: (s: VpScopeMetrics) => number | null; bands: Band[] };
    }
  | { kind: "slabs" };

const ROWS: Row[] = [
  { kind: "section", label: "Revenue Stream" },
  {
    kind: "hero",
    label: "Total Revenue Stream · MTD",
    sub: "GUS + BPU parts & labour + External Sales + scrap/used oil",
    get: (s) => formatCompactCurrency(s.totalRevenueStreamMtd),
  },

  { kind: "section", label: "GUS · General Service" },
  { kind: "metric", label: "GUS Parts · MTD", get: (s) => formatCompactCurrency(s.gusPartsMtd) },
  { kind: "metric", label: "GUS Labour · MTD", get: (s) => formatCompactCurrency(s.gusLabourMtd) },
  {
    kind: "metric",
    label: "GUS Parts / car",
    sub: "Parts MTD ÷ GUS RO MTD",
    get: (s) => formatCompactCurrency(s.gusPartsPerCar),
    band: { value: (s) => s.gusPartsPerCar, bands: PARTS_PER_RO_BANDS },
  },
  {
    kind: "metric",
    label: "GUS Labour / car",
    sub: "Labour MTD ÷ GUS RO MTD",
    get: (s) => formatCompactCurrency(s.gusLabourPerCar),
    band: { value: (s) => s.gusLabourPerCar, bands: LABOUR_PER_RO_BANDS },
  },
  { kind: "metric", label: "GUS RO · MTD", get: (s) => formatNumber(s.gusRoMtd) },

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
  { kind: "metric", label: "BPU RO · MTD", get: (s) => formatNumber(s.bpuRoMtd) },

  { kind: "section", label: "TGLOSS" },
  { kind: "metric", label: tglossText("TGLOSS · MTD"), get: (s) => formatCompactCurrency(s.tglossMtd) },
  { kind: "metric", label: tglossText("TGLOSS Target"), get: (s) => formatCompactCurrency(s.tglossTarget) },
  {
    kind: "metric",
    label: tglossText("TGLOSS Achievement"),
    get: (s) => formatPercent(s.tglossPct),
    tone: (s) => achievementTone(s.tglossPct),
  },

  { kind: "section", label: "Other Revenue" },
  { kind: "metric", label: "External Sales · MTD", get: (s) => formatCompactCurrency(s.externalSalesMtd) },
  { kind: "metric", label: "Scrap & Used Oil · MTD", get: (s) => formatCompactCurrency(s.scrapAndUsedOilMtd) },

  { kind: "section", label: "Incentive Target Slabs" },
  { kind: "slabs" },
];

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
 */
export function RevenueStreamGrid({ scopes, date }: { scopes: VpScopeMetrics[]; date: string }) {
  return (
    // A bounded max-height + its own overflow-y-auto (2026-09-25, at the
    // VP's request for a frozen header) — a plain overflow-x-auto wrapper
    // with no height constraint doesn't work for this: per the CSS overflow
    // spec, overflow-x:auto alone silently forces overflow-y to a
    // scroll-container value too (confirmed — "hidden" here, "auto" without
    // this comment's fix), which hijacks the sticky header below to stick
    // relative to *this div* instead of the page; since the div's own
    // scrollTop never moved (nothing overflowed it — the page scrolled
    // instead), the header never actually looked stuck. Giving it a real
    // height and letting it scroll internally is what makes the header
    // genuinely stick, same pattern as the Regions page's own tables.
    <div className="max-h-[calc(100dvh-14rem)] overflow-auto rounded-2xl border border-border-subtle bg-surface">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          {/* Frozen while the page scrolls (2026-09-25, at the VP's request —
              so which column is Group/Central/South/North stays visible the
              whole way down). Sticky must sit on each cell, not the <tr> —
              table rows don't reliably respect position: sticky, only cells
              do. */}
          <tr className="border-b border-border-subtle">
            <th scope="col" className="sticky top-0 z-10 bg-surface-2 px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-faint">
              Metric
            </th>
            {scopes.map((s, i) => (
              <ColumnHeader key={s.label} scope={s} className={`sticky top-0 z-10 bg-surface-2 ${i === 1 ? "border-l border-border-subtle" : ""}`} />
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
                      {row.get(s)}
                    </td>
                  ))}
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
                <td className="px-5 py-2.5">
                  <div className="text-[13px] font-medium text-fg">{row.label}</div>
                  {row.sub ? <div className="text-[10.5px] leading-tight text-fg-faint">{row.sub}</div> : null}
                </td>
                {scopes.map((s, ci) => {
                  if (row.band) {
                    return (
                      <td key={s.label} className={`px-4 py-2.5 text-right ${ci === 1 ? "border-l border-border-subtle" : ""}`}>
                        <div className={`ml-auto flex h-7 w-fit min-w-24 items-center justify-center rounded px-2 text-sm font-semibold tabular-nums ${bandClassName(row.band.value(s), row.band.bands)}`}>
                          {row.get(s)}
                        </div>
                      </td>
                    );
                  }
                  const tone = row.tone?.(s) ?? "neutral";
                  return (
                    <td
                      key={s.label}
                      className={`px-4 py-2.5 text-right text-sm font-semibold tabular-nums ${TONE_TEXT[tone]} ${ci === 1 ? "border-l border-border-subtle" : ""}`}
                    >
                      {row.get(s)}
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
