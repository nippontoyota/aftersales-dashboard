"use client";

import { useState } from "react";
import type { CloseSaPeriodTotals } from "@/lib/close-sa-analytics/aggregate";
import { SaAnalyticsSections } from "@/components/sa-analytics-sections";
import { branchName } from "@/lib/branch-names";
import type { KlBranchCode } from "@/lib/kl-branches-data";

/**
 * SA-wise Details — a tab per branch rather than one combined leaderboard,
 * since KL01A (General Service) and KL01B (Body & Paint only) land in
 * different SA Analytics categories and aren't meaningfully comparable
 * side by side.
 */
export function KlBranchesSaTabs({
  branches,
  totalsByBranch,
  accessoriesStaffNamesByBranch,
  subtitlePrefix,
}: {
  branches: readonly KlBranchCode[];
  totalsByBranch: Record<string, CloseSaPeriodTotals[]>;
  accessoriesStaffNamesByBranch: Map<string, string[]>;
  subtitlePrefix: string;
}) {
  const [active, setActive] = useState<string>(branches[0]);

  return (
    <div>
      <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="tablist">
        {branches.map((b) => (
          <button
            key={b}
            type="button"
            role="tab"
            aria-selected={active === b}
            onClick={() => setActive(b)}
            className={`rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
              active === b ? "bg-surface text-fg shadow-card" : "text-fg-subtle hover:text-fg"
            }`}
          >
            {branchName(b)} · {b}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {branches.map((b) =>
          active === b ? (
            <SaAnalyticsSections
              key={b}
              totals={totalsByBranch[b] ?? []}
              accessoriesStaffNamesByBranch={accessoriesStaffNamesByBranch}
              subtitlePrefix={subtitlePrefix}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}
