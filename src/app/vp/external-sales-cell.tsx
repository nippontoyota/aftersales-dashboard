"use client";

import { useEffect, useState } from "react";
import { formatCompactCurrency, formatPercent } from "@/lib/format";

/**
 * "Explain this number" for scope-level rows that don't have a natural
 * per-car denominator (External Sales · MTD, 2026-09-25) — the Overview
 * grid's columns are Group/Central/South/North, not branches, so unlike the
 * GUS/BPU/TGLOSS modals (regions/gus-per-car-cell.tsx, which rank one
 * branch against every other branch), this shows what's actually behind a
 * scope's own total: its branches, ranked by their own contribution, each
 * with its share of the scope total.
 */

export type ScopeBranchValue = { branch: string; value: number | null };

function BreakdownModal({
  scopeLabel,
  metricLabel,
  total,
  branches,
  onClose,
}: {
  scopeLabel: string;
  metricLabel: string;
  total: number;
  branches: ScopeBranchValue[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const withValue = branches
    .filter((b): b is { branch: string; value: number } => b.value !== null && b.value !== 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[90dvh] w-full max-w-md overflow-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-faint">{scopeLabel}</div>
            <h2 className="mt-0.5 text-lg font-semibold text-fg">{metricLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-fg-muted hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-fg">{formatCompactCurrency(total)}</div>

        <div className="mt-4 space-y-1.5">
          {withValue.length === 0 ? (
            <p className="text-xs text-fg-faint">No branch has a figure to break this down by yet this month.</p>
          ) : (
            withValue.map((b, i) => {
              const pct = total !== 0 ? b.value / total : null;
              return (
                <div key={b.branch} className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-2/30 px-3 py-2">
                  <span className="flex items-center gap-2 text-[12px] font-medium text-fg">
                    {i === 0 ? <span className="rounded bg-good-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-good">TOP</span> : null}
                    {b.branch}
                  </span>
                  <span className="text-right">
                    <span className="text-sm font-semibold tabular-nums text-fg">{formatCompactCurrency(b.value)}</span>
                    {pct !== null ? <span className="ml-1.5 text-[10.5px] tabular-nums text-fg-faint">{formatPercent(pct)}</span> : null}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function ScopeBreakdownCell({
  scopeLabel,
  metricLabel,
  value,
  branches,
  className,
}: {
  scopeLabel: string;
  metricLabel: string;
  value: number;
  branches: ScopeBranchValue[];
  className: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${scopeLabel} — ${metricLabel}: branch breakdown`}
        className={className}
      >
        {formatCompactCurrency(value)}
      </button>
      {open ? <BreakdownModal scopeLabel={scopeLabel} metricLabel={metricLabel} total={value} branches={branches} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
