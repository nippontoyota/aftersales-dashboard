import { classifySaCategory, type CloseSaPeriodTotals, type SaCategory } from "@/lib/close-sa-analytics/aggregate";
import { CloseSaAnalyticsTable } from "./close-sa-analytics-table";

/**
 * Splits SA Analytics into the 4 categories the user asked for 2026-10-23:
 * GS, BP, Accessories, PDI — each its own collapsible table (same component,
 * just a different slice + title), rather than one flat list mixing every
 * SA's role together.
 *
 * Classification is branch-aware (accessoriesStaffNamesByBranch, not one
 * flat list) because the Accessories roster itself is per-branch (see
 * accessories-staff-store.ts) — a name on CO01A's roster says nothing about
 * someone with the same name at TI01A.
 */
const CATEGORY_ORDER: SaCategory[] = ["GS", "BP", "Accessories", "PDI"];
const CATEGORY_LABELS: Record<SaCategory, string> = {
  GS: "SA Analytics — GS",
  BP: "SA Analytics — BP",
  Accessories: "SA Analytics — Accessories",
  PDI: "SA Analytics — PDI",
};

export function SaAnalyticsSections({
  totals,
  accessoriesStaffNamesByBranch,
  showBranch = false,
  subtitlePrefix,
}: {
  totals: CloseSaPeriodTotals[];
  accessoriesStaffNamesByBranch: Map<string, string[]>;
  showBranch?: boolean;
  subtitlePrefix?: string;
}) {
  const groups: Record<SaCategory, CloseSaPeriodTotals[]> = { GS: [], BP: [], Accessories: [], PDI: [] };
  for (const t of totals) {
    const roster = accessoriesStaffNamesByBranch.get(t.branches[0] ?? "") ?? [];
    groups[classifySaCategory(t, roster)].push(t);
  }

  return (
    <div className="space-y-4">
      {CATEGORY_ORDER.map((cat) => (
        <CloseSaAnalyticsTable
          key={cat}
          title={CATEGORY_LABELS[cat]}
          totals={groups[cat]}
          showBranch={showBranch}
          subtitle={subtitlePrefix ? `${subtitlePrefix} — ${cat} (${groups[cat].length} SAs)` : undefined}
        />
      ))}
    </div>
  );
}
