import type { CeoUnitEconomics } from "@/lib/ceo-data";
import { formatCompactCurrency } from "@/lib/format";

/**
 * Unit Economics — company-wide Revenue/RO (GS/BP/blended), 2026-10-01 at
 * the CEO's request. Bay counts and per-bay targets, which used to have
 * their own tiles here, moved onto the GS/BP Bay Utilization hero cards
 * instead (ceo/page.tsx's UtilizationTile) — the user asked for them next to
 * the utilization % they already describe, rather than a separate tile.
 * Region-level figures live in each region card's expand panel (see
 * region-card.tsx); branch-level in /ceo/branches' row expand panel (see
 * branches/branch-row.tsx). Company-level Profit/RO isn't repeated here —
 * it's already visible in the Profit Breakdown section above.
 */
export function UnitEconomicsSection({ group }: { group: CeoUnitEconomics }) {
  return (
    <>
      <h2 className="mt-10 text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">Unit Economics — MTD</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PerRoTile label="GS Revenue / RO" value={group.gsRevenuePerRo} sub="GS Labour + GS Parts ÷ GUS ROs" />
        <PerRoTile label="BP Revenue / RO" value={group.bpRevenuePerRo} sub="BP Labour + BP Parts ÷ BPU ROs" />
        <PerRoTile label="Revenue / RO" value={group.blendedRevenuePerRo} sub="GS + BP revenue ÷ total ROs" strong />
      </div>
    </>
  );
}

function PerRoTile({ label, value, sub, strong }: { label: string; value: number | null; sub: string; strong?: boolean }) {
  return (
    <div
      className={`group relative overflow-hidden rounded-lg border p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] ${
        strong
          ? "border-accent/20 bg-accent-soft/20 bg-gradient-to-br from-accent/5 to-transparent"
          : "border-border-subtle bg-surface/60"
      }`}
    >
      <div className="text-[10px] font-semibold tracking-wide text-fg-subtle">{label}</div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-fg">{formatCompactCurrency(value)}</div>
      <div className="mt-1 text-[10.5px] text-fg-faint transition-colors duration-200 group-hover:text-fg-subtle">{sub}</div>
    </div>
  );
}
