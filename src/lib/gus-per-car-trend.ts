import { loadSnapshot } from "./snapshot-store";
import { loadAllServiceInfoSnapshotsForMonthUpTo } from "./service-info/store";

/** Where one branch stands among every branch with a real figure for some
 * metric this month — the VP's "who's #1, who's last" ask, shared by the
 * GUS Parts/Labour rank and the GUS-only VAS penetration ranks below. */
export type RankInfo = {
  rank: number;
  total: number;
  leaderBranch: string;
  leaderValue: number;
  lastBranch: string;
  lastValue: number;
  average: number;
};

/** Ranks every {branch, value} row highest-first. A branch simply isn't in
 * `rows` when it has no real figure to rank (no upload this month, or the
 * metric doesn't apply to it) — same "no ratio, drops out" rule the rest of
 * the dashboard follows, rather than ranking it at 0. */
export function rankValues(rows: { branch: string; value: number }[]): Map<string, RankInfo> {
  const ranked = [...rows].sort((a, b) => b.value - a.value);
  if (ranked.length === 0) return new Map();
  const leader = ranked[0];
  const last = ranked[ranked.length - 1];
  const average = ranked.reduce((sum, r) => sum + r.value, 0) / ranked.length;
  return new Map(
    ranked.map((r, i) => [
      r.branch,
      { rank: i + 1, total: ranked.length, leaderBranch: leader.branch, leaderValue: leader.value, lastBranch: last.branch, lastValue: last.value, average },
    ])
  );
}

export type VasCountDetail = {
  count: number;
  /** count ÷ PM Actual (the BA Tool's raw "pm" field, same figure the
   * dashboard labels "PM + OC" elsewhere) — null when this branch has no PM
   * Actual to divide by (BA Tool file missing/zero for this date). */
  penetrationPct: number | null;
  /** Ranked by penetrationPct, not raw count (2026-09-25, at the VP's
   * request — count alone favours a branch with more ROs, not one doing
   * proportionally more of the job). Null when this branch has no
   * penetrationPct to rank. */
  rank: RankInfo | null;
};
export type GusLabourVasCounts = {
  wheelAlignment: VasCountDetail;
  wheelBalancing: VasCountDetail;
  brakeSkimming: VasCountDetail;
};

/**
 * Wheel Alignment / Wheel Balancing / Brake Skimming — MTD counts, PM
 * penetration %, and rank, GS (General Service) only (2026-09-25, at the
 * VP's explicit request — the dashboard's existing Value-Added Services
 * figures elsewhere combine GS with a branch's own Body & Paint desk, see
 * mergeGsAndBp in service-info/store.ts; this deliberately uses the plain,
 * un-merged loader instead so a low Labour/Car figure can be checked
 * against real GS-only job volume). Ranked against every branch that filed
 * a GS Service Info this month AND has a PM Actual for `date` — Body &
 * Paint-only branches never file GS Service Info, so they're naturally
 * absent rather than explicitly excluded.
 */
export async function loadGusLabourVasCounts(branch: string, date: string): Promise<GusLabourVasCounts> {
  const [snapshots, baToolSnapshot] = await Promise.all([loadAllServiceInfoSnapshotsForMonthUpTo(date), loadSnapshot(date)]);

  const byBranch = new Map<string, { wheelAlignment: number; wheelBalancing: number; brakeSkimming: number }>();
  for (const s of snapshots) {
    const existing = byBranch.get(s.branch) ?? { wheelAlignment: 0, wheelBalancing: 0, brakeSkimming: 0 };
    existing.wheelAlignment += s.counts.wheelAlignment;
    existing.wheelBalancing += s.counts.wheelBalancing;
    existing.brakeSkimming += s.counts.brakeSkimming;
    byBranch.set(s.branch, existing);
  }

  const pmActualByBranch = new Map<string, number>();
  for (const row of baToolSnapshot?.branches ?? []) {
    // BA Tool cells come through as number | string | null — only a genuine
    // number is trusted here, same convention report.ts's own num() uses.
    if (typeof row.pm === "number") pmActualByBranch.set(row.branch, row.pm);
  }

  function build(metric: "wheelAlignment" | "wheelBalancing" | "brakeSkimming"): VasCountDetail {
    const rows: { branch: string; value: number }[] = [];
    for (const [b, counts] of byBranch.entries()) {
      const pm = pmActualByBranch.get(b);
      if (pm === undefined || pm === 0) continue;
      rows.push({ branch: b, value: counts[metric] / pm });
    }
    const rankMap = rankValues(rows);

    const count = byBranch.get(branch)?.[metric] ?? 0;
    const pmActual = pmActualByBranch.get(branch);
    const penetrationPct = pmActual !== undefined && pmActual !== 0 ? count / pmActual : null;
    return { count, penetrationPct, rank: rankMap.get(branch) ?? null };
  }

  return { wheelAlignment: build("wheelAlignment"), wheelBalancing: build("wheelBalancing"), brakeSkimming: build("brakeSkimming") };
}
