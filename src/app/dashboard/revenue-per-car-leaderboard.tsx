import type { BranchReport } from "@/lib/report";
import { isBodyPaintOnly } from "@/lib/report";
import { achievementRatio } from "@/lib/aggregate";
import { formatCompact } from "@/lib/format";
import { regionForBranch, type RegionName } from "@/lib/regions";

/**
 * "Who's earning the most per car" — three side-by-side boards, each
 * branches-ranked by revenue-per-RO within a single stream (Parts + Labour
 * for that stream ÷ that stream's RO count; External Sales and scrap/oil
 * are excluded everywhere here — confirmed with the user 2026-09-18, since
 * neither is tied to a GUS or BPU RO count specifically):
 *   1. GUS Revenue per Car — non-BP-only branches, GUS stream
 *   2. BPU Revenue per Car — non-BP-only branches, BPU stream
 *   3. Revenue per Car (Body & Paint only) — BP-only branches, BPU stream
 * Shown compact on the Executive Overview (top 5 + the viewer's own branch
 * per board) and full on Branch Performance, above the per-stream breakdown
 * table.
 *
 * Body & Paint-only branches (CO01E/KL01B/TR01B — see isBodyPaintOnly) get
 * their own board instead of joining board 2: mixed in with every other
 * branch they'd dominate the top and drag the "company avg" tick up
 * (confirmed with the user 2026-09-11, back when this was a single blended
 * Total-Revenue-per-Car board) — same BPU-stream math, ranked and averaged
 * only against each other.
 *
 * Pure presentation — every input is already on BranchReport. A branch with
 * no RO count (or no revenue) yet this month for a given stream has no
 * ratio and drops out of that board's ranking.
 */
const REGION_COLOR: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

function revenuePerCar(parts: number | null, labour: number | null, roCount: number | null): number | null {
  const revenue = parts !== null || labour !== null ? (parts ?? 0) + (labour ?? 0) : null;
  return achievementRatio(revenue, roCount);
}

function gusRevenuePerCar(b: BranchReport): number | null {
  return revenuePerCar(b.gusPartsMtd, b.gusLabourMtd, b.gusRoMtd);
}

function bpuRevenuePerCar(b: BranchReport): number | null {
  return revenuePerCar(b.bpuPartsMtd, b.bpuLabourMtd, b.bpuRoMtd);
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

function rankBranches(branches: BranchReport[], metric: (b: BranchReport) => number | null): Row[] {
  return branches
    .map((b) => ({ branch: b.branch, region: regionForBranch(b.branch), value: metric(b) }))
    .filter((r): r is Omit<Row, "rank"> => r.value !== null)
    .sort((a, b) => b.value - a.value)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

const CARD = "rounded-lg border border-border bg-surface p-4 shadow-card";
const HEADING = "text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle";

/** One ranked board — the main (GUS) one and the small Body & Paint-only
 * one below both render through this, just with different titles/options,
 * so the two never drift out of sync on how a row/avg/highlight works. */
function Board({
  title,
  ranked,
  highlightBranch,
  compactLimit,
  seeAllHref,
  showLegend,
  footnote,
}: {
  title: string;
  ranked: Row[];
  highlightBranch: string | null;
  /** Trim to this many rows (Executive Overview's compact mode); undefined shows everyone. */
  compactLimit?: number;
  seeAllHref?: string;
  showLegend?: boolean;
  footnote?: string;
}) {
  if (ranked.length === 0) return null;

  const max = ranked[0].value;
  const avg = ranked.reduce((sum, r) => sum + r.value, 0) / ranked.length;
  const you = highlightBranch ? ranked.find((r) => r.branch === highlightBranch) ?? null : null;
  const shown = compactLimit ? ranked.slice(0, compactLimit) : ranked;
  const showYouSeparately = you !== null && !shown.some((r) => r.branch === you.branch);

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

      {showLegend || seeAllHref ? (
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
          {seeAllHref ? (
            <a
              href={seeAllHref}
              className="font-medium text-accent-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Full leaderboard →
            </a>
          ) : null}
        </div>
      ) : null}

      {footnote ? <p className="mt-2 text-[10px] leading-relaxed text-fg-faint">{footnote}</p> : null}
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
  const generalBranches = branches.filter((b) => !isBodyPaintOnly(b.branch));
  const bpOnlyBranches = branches.filter((b) => isBodyPaintOnly(b.branch));
  const gusRanked = rankBranches(generalBranches, gusRevenuePerCar);
  const bpuRanked = rankBranches(generalBranches, bpuRevenuePerCar);
  const bpOnlyRanked = rankBranches(bpOnlyBranches, bpuRevenuePerCar);

  if (gusRanked.length === 0 && bpuRanked.length === 0 && bpOnlyRanked.length === 0) {
    return (
      <div className={CARD}>
        <h2 className={HEADING}>Revenue per Car — MTD</h2>
        <div className="mt-3 text-xs text-fg-faint">No revenue-per-car figures yet this month.</div>
      </div>
    );
  }

  const notBpOnly = isBodyPaintOnly(highlightBranch ?? "") ? null : highlightBranch;
  const bpOnlyOnly = isBodyPaintOnly(highlightBranch ?? "") ? highlightBranch : null;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Board
        title="GUS Revenue per Car — MTD"
        ranked={gusRanked}
        highlightBranch={notBpOnly}
        compactLimit={compact ? 5 : undefined}
        seeAllHref={compact ? seeAllHref : undefined}
        showLegend
        footnote={!compact ? "GUS Parts + Labour ÷ GUS ROs. Excludes External Sales and scrap/oil — neither is tied to a GUS RO." : undefined}
      />
      <Board
        title="BPU Revenue per Car — MTD"
        ranked={bpuRanked}
        highlightBranch={notBpOnly}
        compactLimit={compact ? 5 : undefined}
        seeAllHref={compact ? seeAllHref : undefined}
        showLegend
        footnote={!compact ? "BPU Parts + Labour ÷ BPU ROs. Body & Paint-only branches are ranked separately, since their BPU ROs aren't comparable to a mixed branch's." : undefined}
      />
      <Board
        title="Revenue per Car — MTD (Body & Paint only)"
        ranked={bpOnlyRanked}
        highlightBranch={bpOnlyOnly}
        compactLimit={compact ? 5 : undefined}
        seeAllHref={compact ? seeAllHref : undefined}
      />
    </div>
  );
}
