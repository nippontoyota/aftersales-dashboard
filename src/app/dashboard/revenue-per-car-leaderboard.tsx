import type { BranchReport } from "@/lib/report";
import { achievementRatio } from "@/lib/aggregate";
import { formatCompact } from "@/lib/format";
import { regionForBranch, type RegionName } from "@/lib/regions";

/**
 * "Who's earning the most per car" — branches ranked by Total Revenue per
 * Car (total revenue stream MTD ÷ (GUS + BPU ROs), same math as
 * revenue-per-vehicle-table.tsx's "Total Revenue (Rs/Car)" column). Shown
 * compact on the Executive Overview (top 5 + the viewer's own branch) and
 * full on Branch Performance, above the per-stream breakdown table.
 *
 * Pure presentation — every input is already on BranchReport. Branches with
 * no RO count yet this month have no ratio and drop out of the ranking.
 */
const REGION_COLOR: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

function totalRevenuePerCar(b: BranchReport): number | null {
  const combinedRo = b.gusRoMtd !== null || b.bpuRoMtd !== null ? (b.gusRoMtd ?? 0) + (b.bpuRoMtd ?? 0) : null;
  return achievementRatio(b.totalRevenueStreamMtd, combinedRo);
}

type Row = { branch: string; region: RegionName | null; value: number; rank: number };

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
          title={`Company average ₹${formatCompact(avg)}/car`}
        />
      </div>
      <div className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-fg">₹{formatCompact(row.value)}</div>
      {isYou ? (
        <span className="shrink-0 rounded-md bg-accent px-1 text-[9px] font-semibold uppercase tracking-wide text-on-accent">you</span>
      ) : null}
    </div>
  );
}

export function RevenuePerCarLeaderboard({
  branches,
  highlightBranch = null,
  compact = false,
  seeAllHref,
}: {
  branches: BranchReport[];
  /** The viewing branch admin's own branch code — its row is called out. Null for HQ / regional viewers. */
  highlightBranch?: string | null;
  /** Executive Overview: top 5 + the viewer's own branch + a link to the full board. */
  compact?: boolean;
  seeAllHref?: string;
}) {
  const ranked: Row[] = branches
    .map((b) => ({ branch: b.branch, region: regionForBranch(b.branch), value: totalRevenuePerCar(b) }))
    .filter((r): r is Omit<Row, "rank"> => r.value !== null)
    .sort((a, b) => b.value - a.value)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const card = "rounded-lg border border-border bg-surface p-4 shadow-card";
  const heading = "text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle";

  if (ranked.length === 0) {
    return (
      <div className={card}>
        <h2 className={heading}>Revenue per Car — MTD</h2>
        <div className="mt-3 text-xs text-fg-faint">No revenue-per-car figures yet this month.</div>
      </div>
    );
  }

  const max = ranked[0].value;
  const avg = ranked.reduce((sum, r) => sum + r.value, 0) / ranked.length;
  const you = highlightBranch ? ranked.find((r) => r.branch === highlightBranch) ?? null : null;
  const shown = compact ? ranked.slice(0, 5) : ranked;
  const showYouSeparately = you !== null && !shown.some((r) => r.branch === you.branch);

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 className={heading}>Revenue per Car — MTD</h2>
        <span className="shrink-0 text-[10px] text-fg-faint">
          avg ₹{formatCompact(avg)} · {ranked.length} branches
        </span>
      </div>

      {you ? (
        <div className="mt-2 rounded-md bg-accent-soft px-2 py-1.5 text-[11px] text-fg-muted">
          <span className="font-semibold text-accent-text">{you.branch}</span> —{" "}
          <span className="font-semibold text-fg">
            #{you.rank} of {ranked.length}
          </span>{" "}
          at ₹{formatCompact(you.value)}/car,{" "}
          {you.rank === 1
            ? "leading the group."
            : `₹${formatCompact(max - you.value)} behind ${ranked[0].branch}.`}
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

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-dashed border-border pt-2 text-[10px] text-fg-subtle">
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          {(Object.keys(REGION_COLOR) as RegionName[]).map((region) => (
            <span key={region} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: REGION_COLOR[region] }} />
              {region}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-px bg-fg-faint" />
            company avg
          </span>
        </span>
        {compact && seeAllHref ? (
          <a
            href={seeAllHref}
            className="font-medium text-accent-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Full leaderboard →
          </a>
        ) : null}
      </div>

      {!compact ? (
        <p className="mt-2 text-[10px] leading-relaxed text-fg-faint">
          Total revenue stream ÷ (GUS + BPU ROs). Body-shop-heavy branches and higher city tiers naturally sit higher —
          read it alongside the per-stream breakdown below.
        </p>
      ) : null}
    </div>
  );
}
