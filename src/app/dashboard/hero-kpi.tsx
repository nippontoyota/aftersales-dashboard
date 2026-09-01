"use client";

import { useMemo, useState } from "react";
import { computeHeroSummary, filterBranchesByRegion, type HeroSummary } from "@/lib/aggregate";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import type { BranchReport } from "@/lib/report";
import { REGIONS, type RegionName } from "@/lib/regions";

const SCOPE_ACCENT: Record<"All" | RegionName, string> = {
  All: "#0f172a",
  Central: "#2a78d6",
  South: "#eb6834",
  North: "#1baf7a",
};
/** A specific branch pulled in via the "compare a branch" dropdown isn't one
 * of the four fixed scopes, so it gets its own neutral accent rather than
 * borrowing a region's color. */
const BRANCH_ACCENT = "#475569";

type ScopeSummary = { label: string; summary: HeroSummary; accent: string };

function ScopeBanner({ label, value, accent, compact }: { label: string; value: string; accent: string; compact?: boolean }) {
  return (
    <div
      className={`min-w-0 rounded-md border border-slate-200 bg-white ${compact ? "px-2.5 py-2" : "px-3.5 py-3"}`}
      title={`${label} — Total Revenue Stream MTD: ${value}`}
    >
      <div className={`flex items-center gap-1.5 truncate font-medium ${compact ? "text-[10px]" : "text-[11px]"}`} style={{ color: accent }}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-0.5 truncate font-semibold tabular-nums text-slate-900 ${compact ? "text-sm" : "text-lg"}`}>{value}</div>
    </div>
  );
}

type MetricGroup = "GUS" | "BPU" | "External Sales" | "Total";

// Rs-denominated rows use formatCompact (whole numbers) instead of the
// default formatNumber (up to 2 decimals) — at these magnitudes, paise-level
// precision is just visual noise (2026-09-01, at the user's request). RO
// counts are left on the default since they're already whole numbers.
const METRIC_ROWS: { label: string; key: keyof HeroSummary; group: MetricGroup; formatValue?: (v: number | null) => string }[] = [
  { label: "RO billed today", key: "gusRoBilledForTheDay", group: "GUS" },
  { label: "RO — MTD", key: "gusRoMtd", group: "GUS" },
  { label: "Parts MTD (Rs)", key: "gusPartsMtd", group: "GUS", formatValue: formatCompact },
  { label: "Labour MTD (Rs)", key: "gusLabourMtd", group: "GUS", formatValue: formatCompact },
  { label: "RO billed today", key: "bpuRoBilledForTheDay", group: "BPU" },
  { label: "RO — MTD", key: "bpuRoMtd", group: "BPU" },
  { label: "Parts MTD (Rs)", key: "bpuPartsMtd", group: "BPU", formatValue: formatCompact },
  { label: "Labour MTD (Rs)", key: "bpuLabourMtd", group: "BPU", formatValue: formatCompact },
  { label: "External Sales MTD (Rs)", key: "externalSalesMtd", group: "External Sales", formatValue: formatCompact },
  { label: "% on SPR I", key: "externalSalesPctOfSprInternal", group: "External Sales", formatValue: formatPercent },
  { label: "Total MTD (Rs)", key: "totalRevenueStreamMtd", group: "Total", formatValue: formatCompact },
];

/** Scopes run across the columns (not down the rows) so All/Central/South/North
 * — and an optional compared branch — sit side by side for direct comparison. */
function ScopeComparisonTable({ scopes }: { scopes: ScopeSummary[] }) {
  const rows: React.ReactNode[] = [];
  let currentGroup: MetricGroup | null = null;
  for (const row of METRIC_ROWS) {
    const isTotal = row.group === "Total";
    if (row.group !== currentGroup) {
      currentGroup = row.group;
      // "Total" is the grand-total row tying everything above it together —
      // a divider reads better here than repeating a small caps label for a
      // single-row group.
      rows.push(
        isTotal ? (
          <tr key={`${row.group}-header`}>
            <td colSpan={scopes.length + 1} className="pt-2">
              <div className="border-t-2 border-slate-300" />
            </td>
          </tr>
        ) : (
          <tr key={`${row.group}-header`}>
            <td colSpan={scopes.length + 1} className="pb-0.5 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {row.group}
            </td>
          </tr>
        )
      );
    }
    const formatValue = row.formatValue ?? formatNumber;
    rows.push(
      <tr key={`${row.group}-${row.label}`} className={isTotal ? "" : "border-t border-slate-100"}>
        <td className={`whitespace-nowrap py-1.5 pr-3 ${isTotal ? "font-semibold text-slate-900" : "text-slate-500"}`}>{row.label}</td>
        {scopes.map((s) => (
          <td
            key={s.label}
            className={`whitespace-nowrap py-1.5 pl-3 text-right tabular-nums ${isTotal ? "font-bold text-slate-900" : "font-medium text-slate-900"}`}
            title={`${s.label} — ${row.group} ${row.label}: ${formatValue(s.summary[row.key])}`}
          >
            {formatValue(s.summary[row.key])}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[11px]">
        <thead>
          <tr>
            <th className="pb-1 pr-3 text-left text-[10px] font-medium text-slate-400"> </th>
            {scopes.map((s) => (
              <th
                key={s.label}
                className="min-w-[90px] whitespace-nowrap pb-1 pl-3 text-right text-[10px] font-semibold"
                style={{ color: s.accent }}
              >
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

/** All, Central, South and North shown side by side at all times — a CEO
 * comparing regions shouldn't have to flip a filter to see the other three —
 * with an optional dropdown to pull in one specific branch as an extra
 * column when a region-level number needs a closer look. Deliberately takes
 * the *unfiltered* branch list (see dashboard/page.tsx, branches/page.tsx):
 * the page's region filter controls the rest of the page, not this panel.
 *
 * `lockedBranch` (2026-08-29) switches all of that off for a branch admin,
 * locked to their own branch: no region columns (comparing to Central/
 * South/North reveals other branches' territory, not just a filter), no
 * "compare a branch" dropdown, one single column. `branches` must already
 * be pre-filtered to just that branch by the caller (see dashboard-data.ts)
 * — this only decides how to *render* it, the access boundary lives
 * upstream. */
export function HeroKpi({ branches, compact, lockedBranch }: { branches: BranchReport[]; compact?: boolean; lockedBranch?: string }) {
  const [selectedBranch, setSelectedBranch] = useState<string>("__none__");

  const scopes = useMemo<ScopeSummary[]>(() => {
    if (lockedBranch) {
      const branch = branches.find((b) => b.branch === lockedBranch);
      return branch ? [{ label: lockedBranch, summary: computeHeroSummary([branch]), accent: SCOPE_ACCENT.All }] : [];
    }
    const base: ScopeSummary[] = [
      { label: "All", summary: computeHeroSummary(branches), accent: SCOPE_ACCENT.All },
      ...(Object.keys(REGIONS) as RegionName[]).map((region) => ({
        label: region,
        summary: computeHeroSummary(filterBranchesByRegion(branches, region)),
        accent: SCOPE_ACCENT[region],
      })),
    ];
    if (selectedBranch !== "__none__") {
      const branch = branches.find((b) => b.branch === selectedBranch);
      if (branch) base.push({ label: selectedBranch, summary: computeHeroSummary([branch]), accent: BRANCH_ACCENT });
    }
    return base;
  }, [branches, selectedBranch, lockedBranch]);

  return (
    <div className={`rounded-lg border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white shadow-sm ${compact ? "p-3" : "p-4 sm:p-5"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={compact ? "text-xs font-semibold text-slate-900" : "text-sm font-semibold text-slate-900"}>Total Revenue Stream — MTD (Rs)</h2>
        {!lockedBranch ? (
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="h-6 shrink-0 rounded border border-slate-300 px-1 text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <option value="__none__">+ Compare a branch</option>
            {branches.map((b) => (
              <option key={b.branch} value={b.branch}>
                {b.branch}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className={`mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 ${scopes.length > 4 ? "xl:grid-cols-5" : ""}`}>
        {scopes.map((s) => (
          <ScopeBanner key={s.label} label={s.label} value={formatCompact(s.summary.totalRevenueStreamMtd)} accent={s.accent} compact={compact} />
        ))}
      </div>

      <div className={`flex items-baseline justify-between border-t border-dashed border-slate-200 ${compact ? "mt-3 pt-2" : "mt-4 pt-3"}`}>
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Revenue stream breakdown</h3>
      </div>
      <div className="mt-2">
        <ScopeComparisonTable scopes={scopes} />
      </div>
    </div>
  );
}
