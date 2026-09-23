import type { ReactNode } from "react";

/**
 * Renders a string containing "TGLOSS" with the "T" in the brand accent
 * colour and "GLOSS" in the normal text colour — the standard visual
 * treatment for the term everywhere it appears (confirmed 2026-09-23,
 * replacing the earlier "VAS Bill" / "VAS Gentani" / "T-Gloss" spellings
 * app-wide). Splits on every occurrence, so a label like "TGLOSS — % of
 * TGLOSS Target" styles both. Non-TGLOSS text passes through unchanged.
 *
 * Always wrapped in a single <span> — critical when the caller's own
 * container is a flex row with a `gap` (common for label+icon rows): if this
 * returned a bare array/fragment, the "T" span and "GLOSS" text would become
 * separate flex children and the gap would force a visible space between
 * them ("T GLOSS"). A single wrapping element keeps it as one flex item.
 */
export function tglossText(text: string): ReactNode {
  const parts = text.split("TGLOSS");
  if (parts.length === 1) return text;
  return (
    <span>
      {parts.flatMap((part, i) =>
        i === 0
          ? [part]
          : [
              <span key={i} className="text-accent">
                T
              </span>,
              "GLOSS",
              part,
            ],
      )}
    </span>
  );
}
