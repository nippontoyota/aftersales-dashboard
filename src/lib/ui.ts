/**
 * Shared class recipes so the chrome reads as one system — change the look
 * here, not in a dozen files. Compose by interpolation when a call site
 * needs extras (`${control} w-full`, `${eyebrow} mb-2`).
 */

/** Small-caps section label at the top of every panel. */
export const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle";

/** A compact bordered control — 32px tall, 6px radius, standard focus ring.
 * Page-level selects and date pickers; add your own horizontal padding. */
export const control =
  "h-8 rounded-md border border-border-strong bg-surface text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
