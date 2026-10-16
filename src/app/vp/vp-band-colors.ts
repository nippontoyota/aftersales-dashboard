import type { Band } from "../dashboard/revenue-per-vehicle-table";

/**
 * A tinted counterpart to revenue-per-vehicle-table.tsx's bandClassName/
 * BAND_COLORS (2026-09-28, at the VP's request — solid-fill badges across
 * every cell of every VP table read as visually "loud"/congested; a soft
 * tint keeps the same at-a-glance colour read with less weight). Only used
 * on the VP's own pages — the main dashboard's per-vehicle table and
 * everything else built on BAND_COLORS is untouched, since only the VP
 * asked for this. Takes the same `Band[]` (just its `min` cutoffs — the
 * solid `className` on each entry is ignored) so the existing
 * PARTS_PER_RO_BANDS/LABOUR_PER_RO_BANDS/TGLOSS_PER_RO_BANDS threshold
 * arrays can be reused as-is.
 */
const SOFT_TIER_COLORS = [
  "bg-emerald-500/15 text-emerald-400",
  "bg-yellow-400/15 text-yellow-300",
  "bg-orange-500/15 text-orange-400",
] as const;
const SOFT_RED = "bg-red-500/15 text-red-400";

export function softBandClassName(value: number | null, bands: readonly Pick<Band, "min">[]): string {
  if (value === null) return "bg-surface-2 text-fg-faint";
  for (let i = 0; i < bands.length; i++) {
    if (value >= bands[i].min) return SOFT_TIER_COLORS[i] ?? SOFT_RED;
  }
  return SOFT_RED;
}

/** Same 100/90/75% cutoffs as the per-vehicle bands above, but standalone (not keyed off a Band[]) —
 * used for any ratio-vs-target cell that isn't one of the PARTS/LABOUR/TGLOSS per-RO metrics, e.g. the
 * VP's Slab and TKM tables. */
const SLAB_BANDS: { min: number }[] = [{ min: 1.0 }, { min: 0.9 }, { min: 0.75 }];

export function slabBandClassName(ratio: number | null): string {
  return softBandClassName(ratio, SLAB_BANDS);
}

/** The emerald tier's own class string, for a caller that needs to apply it without a ratio to grade (e.g. an "on pace" cell being forced green regardless of its exact projected ratio). */
export const SLAB_GREEN_CLASS = SOFT_TIER_COLORS[0];
