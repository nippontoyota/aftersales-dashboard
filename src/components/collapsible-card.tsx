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
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      >
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{title}</span>
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
      {open ? <div className="border-t border-border-subtle">{children}</div> : null}
    </div>
  );
}
