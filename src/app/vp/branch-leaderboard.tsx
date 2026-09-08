import Link from "next/link";
import { achievementRatio, achievementTone } from "@/lib/aggregate";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import { regionForBranch, type RegionName } from "@/lib/regions";
import type { BranchReport } from "@/lib/report";

const REGION_COLOR: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

const BAR_TONE = {
  good: "bg-good-solid",
  warn: "bg-warn-solid",
  critical: "bg-bad-solid",
  neutral: "bg-border-strong",
} as const;

/**
 * The Branches landing view — every branch as a card, ranked by total
 * revenue, so the page isn't empty before one is picked. Each card links to
 * that branch's full detail.
 */
export function BranchLeaderboard({ branches, date }: { branches: BranchReport[]; date: string }) {
  const ranked = branches
    .map((b) => ({
      b,
      total: b.totalRevenueStreamMtd,
      vasRatio: achievementRatio(b.vasAchievementForTheMonth, b.vasBillTarget),
    }))
    .sort((x, y) => (y.total ?? -1) - (x.total ?? -1));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {ranked.map(({ b, total, vasRatio }, i) => {
        const region = regionForBranch(b.branch);
        const tone = achievementTone(vasRatio);
        return (
          <Link
            key={b.branch}
            href={`/vp/branches?date=${date}&branch=${b.branch}`}
            className="group rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-border-strong hover:bg-surface-2/40"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: region ? REGION_COLOR[region] : "var(--color-border-strong)" }} />
                {b.branch}
              </span>
              <span className="text-[11px] tabular-nums text-fg-faint">#{i + 1}</span>
            </div>

            <div className="mt-3 text-xl font-semibold tabular-nums tracking-tight text-fg">
              {formatCompactCurrency(total)}
            </div>
            <div className="text-[11px] uppercase tracking-[0.06em] text-fg-faint">Total revenue · MTD</div>

            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="GUS RO" value={b.gusRoMtd?.toLocaleString("en-IN") ?? "—"} />
              <Stat label="BPU RO" value={b.bpuRoMtd?.toLocaleString("en-IN") ?? "—"} />
              <Stat label="VAS %" value={vasRatio == null ? "—" : formatPercent(vasRatio)} />
            </dl>

            {vasRatio != null ? (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className={`h-full rounded-full ${BAR_TONE[tone]}`} style={{ width: `${Math.min(100, Math.round(vasRatio * 100))}%` }} />
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.06em] text-fg-faint">VAS vs target</div>
              </div>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2/60 py-1.5">
      <div className="text-[13px] font-semibold tabular-nums text-fg">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.05em] text-fg-faint">{label}</div>
    </div>
  );
}
