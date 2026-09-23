import type { ReactNode } from "react";

/**
 * Renders a string containing "TGLOSS" with the "T" in the brand accent
 * colour and "GLOSS" in the normal text colour — the standard visual
 * treatment for the term everywhere it appears (confirmed 2026-09-23,
 * replacing the earlier "VAS Bill" / "VAS Gentani" / "T-Gloss" spellings
 * app-wide). Splits on every occurrence, so a label like "TGLOSS — % of
 * TGLOSS Target" styles both. Non-TGLOSS text passes through unchanged.
 */
export function tglossText(text: string): ReactNode {
  const parts = text.split("TGLOSS");
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <span key={i} className="text-accent">
            T
          </span>,
          "GLOSS",
          part,
        ],
  );
}
