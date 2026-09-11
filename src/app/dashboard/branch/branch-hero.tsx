import type { BranchView } from "@/lib/branch-view-data";
import { formatCompact, formatCompactCurrency, formatPercent } from "@/lib/format";
import { achievementTone } from "@/lib/aggregate";
import { eyebrow } from "@/lib/ui";

function RankBadge({ rank }: { rank: { rank: number; of: number } | null }) {
  if (!rank) return null;
  const top = rank.rank === 1;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
        top ? "bg-warn-soft text-warn" : rank.rank <= 3 ? "bg-surface-3 text-fg" : "bg-surface-2 text-fg-muted"
      }`}
    >
      #{rank.rank}
      <span className="font-normal text-fg-faint">of {rank.of}</span>
    </span>
  );
}

function BigCard({
  label,
  value,
  rank,
  foot,
  edge,
}: {
  label: string;
  value: string;
  rank: { rank: number; of: number } | null;
  foot: React.ReactNode;
  edge: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-surface p-4 shadow-card">
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: edge }} />
      <div className="flex items-start justify-between gap-2">
        <p className={eyebrow}>{label}</p>
        <RankBadge rank={rank} />
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-fg">{value}</div>
      <div className="mt-1.5 text-[11px] text-fg-faint">{foot}</div>
    </div>
  );
}

function SmallCard({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">{label}</p>
      <div className="mt-1 text-base font-semibold tabular-nums text-fg">{value}</div>
      {sub ? <div className="mt-0.5 text-[10px] text-fg-faint">{sub}</div> : null}
    </div>
  );
}

export function BranchHero({ view }: { view: BranchView }) {
  const { report, ranks } = view;
  const vasTone = achievementTone(view.vasPct);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <BigCard
        label="Total Revenue Stream MTD"
        value={formatCompactCurrency(view.totalRevenueMtd)}
        rank={ranks.totalRevenue}
        edge="var(--color-violet)"
        foot={
          <span>
            Projected <span className="font-medium text-fg-subtle tabular-nums">{formatCompactCurrency(view.projectedTotalRevenue)}</span>
            {view.lastMonth?.totalRevenue != null ? (
              <>
                {" · "}
                {view.lastMonth.label} <span className="font-medium text-fg-subtle tabular-nums">{formatCompactCurrency(view.lastMonth.totalRevenue)}</span>
              </>
            ) : null}
          </span>
        }
      />
      <BigCard
        label="Revenue per Car — MTD"
        value={formatCompactCurrency(view.revenuePerCar)}
        rank={ranks.revenuePerCar}
        edge="var(--color-indigo)"
        foot={
          <span>
            {view.region ? (
              <>
                {view.region} avg <span className="font-medium text-fg-subtle tabular-nums">{formatCompactCurrency(view.benchmarks.regionAvgPerCar)}</span>
                {" · "}
              </>
            ) : null}
            Company avg <span className="font-medium text-fg-subtle tabular-nums">{formatCompactCurrency(view.benchmarks.companyAvgPerCar)}</span>
          </span>
        }
      />

      <div className="grid grid-cols-3 gap-3 sm:col-span-2">
        <SmallCard
          label="GUS RO — MTD"
          value={formatCompact(report.gusRoMtd)}
          sub={
            <>
              {formatCompactCurrency(
                report.gusPartsMtd != null || report.gusLabourMtd != null
                  ? (report.gusPartsMtd ?? 0) + (report.gusLabourMtd ?? 0)
                  : null,
              )}{" "}
              revenue
            </>
          }
        />
        <SmallCard
          label="BPU RO — MTD"
          value={formatCompact(report.bpuRoMtd)}
          sub={
            <>
              {formatCompactCurrency(
                report.bpuPartsMtd != null || report.bpuLabourMtd != null
                  ? (report.bpuPartsMtd ?? 0) + (report.bpuLabourMtd ?? 0)
                  : null,
              )}{" "}
              revenue
            </>
          }
        />
        <SmallCard
          label="VAS Bill — MTD"
          value={formatCompactCurrency(report.vasAchievementForTheMonth)}
          sub={
            <span
              className={
                vasTone === "good" ? "text-good" : vasTone === "warn" ? "text-warn" : vasTone === "critical" ? "text-bad" : "text-fg-faint"
              }
            >
              {formatPercent(view.vasPct)} of target
            </span>
          }
        />
      </div>
    </div>
  );
}
