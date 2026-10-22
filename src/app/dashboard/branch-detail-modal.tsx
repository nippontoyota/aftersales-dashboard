"use client";

import { useState } from "react";
import type { BranchReport } from "@/lib/report";

/** camelCase field name -> "Title Case" label. Deliberately mechanical (not
 * hand-labelled) since this shows every field report.ts computes, including
 * internal/HQ-oriented ones with no curated label elsewhere. */
function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString("en-IN") : value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Wraps a branch name/header so clicking it pops up every field report.ts
 * computes for that branch (2026-10-22, at the regional managers' request —
 * "all metrics of that particular branch", deliberately the full raw
 * BranchReport rather than a curated subset). */
export function BranchDetailModal({ report, label, code, children }: { report: BranchReport; label: string; code: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const fields = Object.entries(report).filter(([key]) => key !== "branch");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-left hover:underline" title="Click to view every metric for this branch">
        {children}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle pb-3">
              <div>
                <div className="text-sm font-semibold text-fg">{label}</div>
                <div className="text-[11px] text-fg-faint">{code} — every metric report.ts tracks for this branch</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-fg-faint hover:bg-surface-2 hover:text-fg" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {fields.map(([key, value]) => (
                <div key={key} className="flex items-baseline justify-between gap-2 border-b border-border-subtle/60 py-1 text-[11px]">
                  <span className="text-fg-faint">{humanize(key)}</span>
                  <span className="tabular-nums font-medium text-fg">{formatValue(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
