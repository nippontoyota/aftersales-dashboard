"use client";

import { useState } from "react";
import { formatCompact } from "@/lib/format";
import type { RegionName } from "@/lib/regions";

/**
 * Client half of the revenue-per-car leaderboard — split out from
 * revenue-per-car-leaderboard.tsx (2026-09-21) because that file also holds
 * RevenuePerCarLeaderboard's data prep, which calls the real isBodyPaintOnly
 * from @/lib/report; report.ts pulls in server-only DB code (pg) at module
 * scope, so a "use client" directive on that whole file broke the dev
 * server (bundler tried to ship `pg` to the browser). This file only ever
 * receives already-computed Row[] — no @/lib/report import, safe to be a
 * client component on its own.
 */
export const REGION_COLOR: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

export type Row = { branch: string; region: RegionName | null; value: number; rank: number };

const CARD = "rounded-lg border border-border bg-surface p-4 shadow-card";
const HEADING = "text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle";

/** Subtle podium tint on the rank number for the top three; a plain faint
 * number below that. */
function RankChip({ rank }: { rank: number }) {
  const podium =
    rank === 1
      ? "bg-warn-soft text-warn"
      : rank === 2
        ? "bg-surface-3 text-fg"
        : rank === 3
          ? "bg-surface-2 text-fg-muted"
          : "text-fg-faint";
  return (
    <span
      className={`inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-md px-1 text-[10px] font-semibold tabular-nums ${podium}`}
    >
      {rank}
    </span>
  );
}

function LeaderRow({ row, max, avg, isYou }: { row: Row; max: number; avg: number; isYou: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-1.5 py-1 ${isYou ? "bg-accent-soft ring-1 ring-inset ring-accent" : ""}`}
    >
      <RankChip rank={row.rank} />
      <div className="w-14 shrink-0 truncate text-xs font-medium text-fg-muted">{row.branch}</div>
      <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(2, (row.value / max) * 100)}%`,
            backgroundColor: row.region ? REGION_COLOR[row.region] : "var(--color-fg-faint)",
          }}
        />
        <div
          className="absolute inset-y-0 w-px bg-fg-faint"
          style={{ left: `${(avg / max) * 100}%` }}
          title={`Average ₹${formatCompact(avg)}/car`}
        />
      </div>
      <div className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-fg">₹{formatCompact(row.value)}</div>
      {isYou ? (
        <span className="shrink-0 rounded-md bg-accent px-1 text-[9px] font-semibold uppercase tracking-wide text-on-accent">you</span>
      ) : null}
    </div>
  );
}

/** One ranked board — the main (GUS) one and the small Body & Paint-only
 * one below both render through this, just with different titles/options,
 * so the two never drift out of sync on how a row/avg/highlight works. */
export function Board({
  title,
  ranked,
  highlightBranch,
  compactLimit,
  expandable,
  showLegend,
  footnote,
}: {
  title: string;
  ranked: Row[];
  highlightBranch: string | null;
  /** Trim to this many rows (Executive Overview's compact mode); undefined shows everyone. */
  compactLimit?: number;
  /** Executive Overview: lets the board expand past compactLimit in place
   * instead of linking out to /branches (2026-09-21, at the user's request —
   * the full ranking used to open Branch Performance; now it stays on this
   * card). No-op without compactLimit. */
  expandable?: boolean;
  showLegend?: boolean;
  footnote?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (ranked.length === 0) return null;

  const max = ranked[0].value;
  const avg = ranked.reduce((sum, r) => sum + r.value, 0) / ranked.length;
  const you = highlightBranch ? ranked.find((r) => r.branch === highlightBranch) ?? null : null;
  const isTrimmed = compactLimit !== undefined && !expanded;
  const shown = isTrimmed ? ranked.slice(0, compactLimit) : ranked;
  const showYouSeparately = you !== null && !shown.some((r) => r.branch === you.branch);
  const canExpand = expandable && compactLimit !== undefined && ranked.length > compactLimit;

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <h2 className={HEADING}>{title}</h2>
        <span className="shrink-0 text-[10px] text-fg-faint">
          avg ₹{formatCompact(avg)} · {ranked.length} branch{ranked.length === 1 ? "" : "es"}
        </span>
      </div>

      {you ? (
        <div className="mt-2 rounded-md bg-accent-soft px-2 py-1.5 text-[11px] text-fg-muted">
          <span className="font-semibold text-accent-text">{you.branch}</span> —{" "}
          <span className="font-semibold text-fg">
            #{you.rank} of {ranked.length}
          </span>{" "}
          at ₹{formatCompact(you.value)}/car,{" "}
          {you.rank === 1 ? "leading the group." : `₹${formatCompact(max - you.value)} behind ${ranked[0].branch}.`}
        </div>
      ) : null}

      <div className="mt-2.5 space-y-0.5">
        {shown.map((r) => (
          <LeaderRow key={r.branch} row={r} max={max} avg={avg} isYou={r.branch === highlightBranch} />
        ))}
        {showYouSeparately && you ? (
          <>
            <div className="py-0.5 text-center text-[10px] leading-none text-fg-faint">···</div>
            <LeaderRow row={you} max={max} avg={avg} isYou />
          </>
        ) : null}
      </div>

      {showLegend || canExpand ? (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-dashed border-border pt-2 text-[10px] text-fg-subtle">
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {showLegend
              ? (Object.keys(REGION_COLOR) as RegionName[]).map((region) => (
                  <span key={region} className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm" style={{ background: REGION_COLOR[region] }} />
                    {region}
                  </span>
                ))
              : null}
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-px bg-fg-faint" />
              avg
            </span>
          </span>
          {canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="font-medium text-accent-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {expanded ? "Show top 5 ↑" : `Full leaderboard (${ranked.length}) ↓`}
            </button>
          ) : null}
        </div>
      ) : null}

      {footnote ? <p className="mt-2 text-[10px] leading-relaxed text-fg-faint">{footnote}</p> : null}
    </div>
  );
}
