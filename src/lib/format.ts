export function formatNumber(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Rounds to whole numbers — used in dense per-branch tables where paise-level
 * precision just adds visual noise across many rows; full precision is still
 * available via formatNumber wherever a single headline figure is shown. */
export function formatCompact(value: number | null): string {
  if (value === null) return "—";
  return Math.round(value).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/** Always treats `value` as a fraction (0.516 -> 51.6%), same convention as
 * achievementRatio() everywhere it's consumed. Used to have a "values above
 * 1.5 are already a percentage" heuristic, on the assumption achievement
 * never really exceeds 150% of target — wrong: VAS regularly clears that
 * (e.g. 1.762 = 176.2%), and the heuristic silently rendered it as "1.8%"
 * instead (found 2026-08-31, auditing real branch logins — KL01A/TI01C
 * showed as each region's "weakest" VAS performer at a glance when they
 * were actually the strongest). Every real call site in this codebase
 * already passes a raw ratio, never a pre-multiplied percentage, so there's
 * no case the old heuristic was actually needed for. */
export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`;
}

/** Indian crore/lakh notation (₹12.95 Cr / ₹51.2 L) — for headline Rs figures
 * where the full-precision number (12,95,38,382.7) is wide enough to break a
 * card's layout next to smaller values like a unit count or a percentage.
 * Below 1 lakh, falls back to a plain ₹-prefixed number — crore/lakh
 * notation on a four-digit figure would read as odd, not concise. */
export function formatCompactCurrency(value: number | null): string {
  if (value === null) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`;
  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
