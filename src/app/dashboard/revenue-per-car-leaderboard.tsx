import type { BranchReport } from "@/lib/report";
import { isBodyPaintOnly } from "@/lib/report";
import { achievementRatio } from "@/lib/aggregate";
import { regionForBranch } from "@/lib/regions";
import { Board, type Row } from "./revenue-per-car-board";

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
 * per board, expandable in place — see revenue-per-car-board.tsx) and full
 * on Branch Performance, above the per-stream breakdown table.
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
 *
 * This half stays a server component — it calls the real isBodyPaintOnly
 * from @/lib/report, which (via that file's DB-backed neighbours) pulls in
 * server-only code. The interactive rendering (expand/collapse) lives in
 * revenue-per-car-board.tsx, a separate "use client" file that only ever
 * receives plain Row[] data, never a @/lib/report import.
 */
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

function rankBranches(branches: BranchReport[], metric: (b: BranchReport) => number | null): Row[] {
  return branches
    .map((b) => ({ branch: b.branch, region: regionForBranch(b.branch), value: metric(b) }))
    .filter((r): r is Omit<Row, "rank"> => r.value !== null)
    .sort((a, b) => b.value - a.value)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

const CARD = "rounded-lg border border-border bg-surface p-4 shadow-card";
const HEADING = "text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle";

export function RevenuePerCarLeaderboard({
  branches,
  highlightBranch = null,
  compact = false,
}: {
  branches: BranchReport[];
  /** The viewing branch admin's own branch code — its row is called out. Null for HQ / regional viewers. */
  highlightBranch?: string | null;
  /** Executive Overview: top 5 + the viewer's own branch, with a "Full leaderboard" toggle that expands each board in place (2026-09-21 — previously linked out to /branches). */
  compact?: boolean;
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
        expandable={compact}
        showLegend
        footnote={!compact ? "GUS Parts + Labour ÷ GUS ROs. Excludes External Sales and scrap/oil — neither is tied to a GUS RO." : undefined}
      />
      <Board
        title="BPU Revenue per Car — MTD"
        ranked={bpuRanked}
        highlightBranch={notBpOnly}
        compactLimit={compact ? 5 : undefined}
        expandable={compact}
        showLegend
        footnote={!compact ? "BPU Parts + Labour ÷ BPU ROs. Body & Paint-only branches are ranked separately, since their BPU ROs aren't comparable to a mixed branch's." : undefined}
      />
      <Board
        title="Revenue per Car — MTD (Body & Paint only)"
        ranked={bpOnlyRanked}
        highlightBranch={bpOnlyOnly}
        compactLimit={compact ? 5 : undefined}
        expandable={compact}
      />
    </div>
  );
}
