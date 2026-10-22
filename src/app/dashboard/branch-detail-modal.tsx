"use client";

import { useState } from "react";
import type { BranchReport } from "@/lib/report";
import { CondensedMetrics } from "./branch/condensed-metrics";

/** Wraps a branch name/header so clicking it pops up that branch's metrics —
 * the same curated, formatted set (today/MTD/target/% achievement/rank) a
 * branch account sees on its own Branch Overview page, reusing
 * CondensedMetrics rather than dumping every raw report.ts field
 * (2026-10-22, narrowed from an earlier raw-dump version at the regional
 * managers' request — same metrics, neater formatting). Passes
 * `alwaysShowAll` so every row renders with no toggle, unlike the branch's
 * own page, which default-collapses to the key metrics. */
export function BranchDetailModal({
  report,
  label,
  code,
  allBranches,
  todayHeader,
  children,
}: {
  report: BranchReport;
  label: string;
  code: string;
  allBranches: BranchReport[];
  todayHeader: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-left hover:underline" title="Click to view this branch's metrics">
        {children}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle pb-3">
              <div>
                <div className="text-sm font-semibold text-fg">{label}</div>
                <div className="text-[11px] text-fg-faint">{code}</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-fg-faint hover:bg-surface-2 hover:text-fg" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="mt-3">
              <CondensedMetrics report={report} allBranches={allBranches} todayHeader={todayHeader} alwaysShowAll />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
