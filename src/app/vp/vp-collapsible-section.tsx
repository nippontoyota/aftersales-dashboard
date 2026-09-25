"use client";

import { useState, type ReactNode } from "react";

/**
 * Same click-to-expand shape as @/components/collapsible-card, but the
 * content stays mounted and is only CSS-hidden when collapsed (that shared
 * component unmounts its children entirely on close). Needed specifically
 * for the Overview page's full grid (2026-09-25): it's collapsed by
 * default now that the KPI cards summarise the same numbers above it, but
 * "Export to PDF" (window.print()) must still be able to print it — a
 * `display:none` element can be forced visible for print with the
 * `print:block` override below, an unmounted one can't.
 */
export function VpCollapsibleSection({
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
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="print:hidden flex w-full items-center justify-between gap-2 px-5 py-3 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      >
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{title}</span>
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
      <div className={open ? "border-t border-border-subtle" : "hidden print:block print:border-t print:border-border-subtle"}>{children}</div>
    </div>
  );
}
