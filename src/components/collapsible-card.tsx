"use client";

import { useState, type ReactNode } from "react";

/**
 * Click-to-expand section card — everything on the dashboard except the
 * GUS/BPU headline hero lives inside one of these, collapsed by default, so
 * the page reads as a scannable executive summary rather than a wall of
 * tables. The header itself is the toggle; a native <select> or other
 * interactive control must go in the body, never the header (a <button>
 * can't legally contain another interactive control).
 */
export function CollapsibleCard({
  title,
  subtitle,
  defaultOpen = false,
  clip = false,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  /** overflow-clip instead of overflow-hidden: still rounds the corners, but doesn't make the card a scroll container, so a `position: sticky` table header inside it pins against the page. */
  clip?: boolean;
  /** Extra controls (e.g. a download link) shown beside the title — a sibling of the toggle button, never
   * inside it (a <button> can't legally contain another interactive control), so these keep their own
   * click behaviour instead of also collapsing/expanding the card. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`${clip ? "overflow-clip" : "overflow-hidden"} rounded-lg border border-border bg-surface shadow-card`}>
      <div className="flex items-center gap-2 px-3.5 py-2.5 hover:bg-surface-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">{title}</span>
            {subtitle ? <span className="text-[11px] font-normal normal-case text-fg-faint">{subtitle}</span> : null}
          </span>
          <svg
            className={`h-4 w-4 shrink-0 text-fg-faint transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {actions ? <span className="shrink-0">{actions}</span> : null}
      </div>
      {open ? <div className="border-t border-border-subtle">{children}</div> : null}
    </div>
  );
}
