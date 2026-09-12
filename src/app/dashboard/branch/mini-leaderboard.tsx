"use client";

import { useState } from "react";
import type { BranchMetricKey, LeaderboardRow } from "@/lib/branch-view-data";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import type { RegionName } from "@/lib/regions";
import { eyebrow } from "@/lib/ui";

const METRICS: { key: BranchMetricKey; label: string; fmt: (v: number | null) => string }[] = [
  { key: "revenuePerCar", label: "Revenue per Car", fmt: formatCompactCurrency },
  { key: "totalRevenue", label: "Total Revenue Stream", fmt: formatCompactCurrency },
  { key: "vasPct", label: "VAS Bill — % of target", fmt: formatPercent },
];

const REGION_DOT: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

/** #1, the branches immediately above and below you, and you — a compact
 * slice of the full ranking rather than all 18 rows. */
function slice(rows: LeaderboardRow[]): { row: LeaderboardRow; rank: number }[] {
  const ranked = rows.map((row, i) => ({ row, rank: i + 1 }));
  const youIdx = ranked.findIndex((r) => r.row.isYou);
  if (youIdx === -1) return ranked.slice(0, 5);

  const keep = new Set<number>([0, youIdx - 1, youIdx, youIdx + 1]);
  const picked = ranked.filter((_, i) => keep.has(i));
  // De-dupe adjacency (e.g. you are #2 → #1 appears once) and keep order.
  return picked;
}

export function MiniLeaderboard({
  leaderboards,
}: {
  leaderboards: Record<BranchMetricKey, LeaderboardRow[]>;
}) {
  const [metricKey, setMetricKey] = useState<BranchMetricKey>("revenuePerCar");
  const metric = METRICS.find((m) => m.key === metricKey)!;
  const rows = slice(leaderboards[metricKey]);
  const showGapAfter0 = rows.length > 1 && rows[0].rank === 1 && rows[1].rank > 2;

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={eyebrow}>Where you rank</h2>
        <select
          value={metricKey}
          onChange={(e) => setMetricKey(e.target.value as BranchMetricKey)}
          className="h-7 rounded-md border border-border-strong bg-surface px-2 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <ol className="mt-3 space-y-1">
        {rows.map(({ row, rank }, i) => (
          <li key={row.branch}>
            {i === 1 && showGapAfter0 ? (
              <div className="py-0.5 text-center text-[10px] text-fg-faint">···</div>
            ) : null}
            <div
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                row.isYou ? "bg-violet-soft font-semibold text-fg" : "text-fg-subtle"
              }`}
            >
              <span className="w-6 shrink-0 tabular-nums text-fg-faint">#{rank}</span>
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: row.region ? REGION_DOT[row.region] : "var(--color-fg-faint)" }}
              />
              <span className="tabular-nums">{row.branch}</span>
              {row.isYou ? <span className="text-[10px] font-normal text-violet">you</span> : null}
              <span className="ml-auto tabular-nums">{metric.fmt(row.value)}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
