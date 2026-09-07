/**
 * Shared class recipes so every dashboard panel reads as one system —
 * change the look here, not in fifteen files. Compose with `cn()` when a
 * call site needs extras (e.g. `flex h-full flex-col` for equal-height
 * cards in a 2-up grid).
 */

/** The standard panel surface: hairline border, soft elevation, 8px radius. */
export const panelCard = "rounded-lg border border-border bg-surface shadow-card";

/** Small-caps section label used at the top of every panel. */
export const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle";

/** A compact bordered control (select / stepper button) — 32px tall, matches
 * the header toolbar and the hero-strip switcher. */
export const control =
  "h-8 rounded-md border border-border-strong bg-surface text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
