import type { CeoUnitEconomics } from "@/lib/ceo-data";
import { formatCompact, formatCompactCurrency, formatNumber } from "@/lib/format";

/**
 * Capacity & Unit Economics — company-wide Revenue/RO (GS/BP/blended), bay
 * counts, and per-bay productivity targets (2026-10-01, at the CEO's
 * request). Region-level figures moved into each region card's expand panel
 * instead (see region-card.tsx) — the region table that used to live here
 * was dropped in favor of that, at the user's request, so region data lives
 * in one place rather than two. Branch-level figures live in
 * /ceo/branches' row expand panel (see branches/branch-row.tsx).
 * Company-level Profit/RO isn't repeated here — it's already visible in the
 * Profit Breakdown section above.
 */
export function UnitEconomicsSection({ group }: { group: CeoUnitEconomics }) {
  return (
    <>
      <h2 className="mt-10 text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">Capacity &amp; Unit Economics — MTD</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <PerRoTile label="GS Revenue / RO" value={group.gsRevenuePerRo} sub="GS Labour + GS Parts ÷ GUS ROs" />
        <PerRoTile label="BP Revenue / RO" value={group.bpRevenuePerRo} sub="BP Labour + BP Parts ÷ BPU ROs" />
        <PerRoTile label="Revenue / RO" value={group.blendedRevenuePerRo} sub="GS + BP revenue ÷ total ROs" strong />
        <CapacityTile label="GS Capacity" bays={group.gsBays} targetPerBayPerDay={group.gsTargetPerBayPerDay} />
        <CapacityTile label="BP Capacity" bays={group.bpBays} targetPerBayPerDay={group.bpTargetPerBayPerDay} />
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

function CapacityTile({ label, bays, targetPerBayPerDay }: { label: string; bays: number; targetPerBayPerDay: number | null }) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-border-subtle bg-surface/60 p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
      <div className="text-[10px] font-semibold tracking-wide text-fg-subtle">{label}</div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-fg">{formatCompact(bays)} bays</div>
      <div className="mt-1 text-[10.5px] text-fg-faint transition-colors duration-200 group-hover:text-fg-subtle">
        {targetPerBayPerDay === null ? "No target" : `${formatNumber(targetPerBayPerDay)} ROs/bay/day target`}
      </div>
    </div>
  );
}
