import type { CeoRegionRollup, CeoUnitEconomics } from "@/lib/ceo-data";
import { formatCompact, formatCompactCurrency, formatNumber } from "@/lib/format";

/**
 * Capacity & Unit Economics — Revenue/RO (GS/BP/blended), bay counts, and
 * per-bay productivity targets, at company and region scope (2026-10-01, at
 * the CEO's request). Branch-level figures live in /ceo/branches' row
 * expand panel instead (see branch-row.tsx) rather than here — this section
 * stays a company summary + a 3-row region table, matching the "new
 * dedicated section, don't touch the existing Profit Breakdown" scope
 * agreed with the user. Company-level Profit/RO isn't repeated here (it's
 * already visible in the Profit Breakdown section above); region-level
 * Profit/RO is new, so the region table does include it.
 */
export function UnitEconomicsSection({ group, regions }: { group: CeoUnitEconomics; regions: CeoRegionRollup[] }) {
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

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="[&>th]:border-b [&>th]:border-border">
              <th className="bg-surface py-2.5 pl-5 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-faint">Region</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">GS Revenue/RO</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">BP Revenue/RO</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">GS Profit/RO</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">BP Profit/RO</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">GS Bays</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">GS Target/Bay/Day</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">BP Bays</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">BP Target/Bay/Day</th>
            </tr>
          </thead>
          <tbody>
            {regions.map((r) => (
              <tr key={r.region} className="border-t border-border-subtle hover:bg-surface-2/40">
                <td className="whitespace-nowrap py-2 pl-5 pr-3 font-semibold text-fg">{r.region}</td>
                <td className="px-4 py-2 text-right tabular-nums text-fg">{formatCompactCurrency(r.unitEconomics.gsRevenuePerRo)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-fg">{formatCompactCurrency(r.unitEconomics.bpRevenuePerRo)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{formatCompactCurrency(r.unitEconomics.gsProfitPerRo)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{formatCompactCurrency(r.unitEconomics.bpProfitPerRo)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{formatCompact(r.unitEconomics.gsBays)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{formatNumber(r.unitEconomics.gsTargetPerBayPerDay)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{formatCompact(r.unitEconomics.bpBays)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{formatNumber(r.unitEconomics.bpTargetPerBayPerDay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
