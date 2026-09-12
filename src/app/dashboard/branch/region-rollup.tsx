import type { RegionRollup } from "@/lib/branch-view-data";
import { achievementTone, type AchievementTone } from "@/lib/aggregate";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import type { RegionName } from "@/lib/regions";
import { eyebrow } from "@/lib/ui";

const TONE_TEXT: Record<AchievementTone, string> = {
  good: "text-good",
  warn: "text-warn",
  critical: "text-bad",
  neutral: "text-fg-faint",
};
const REGION_COLOR: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

function Stat({ label, value, sub, subClass }: { label: string; value: string; sub?: string; subClass?: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{value}</div>
      {sub ? <div className={`text-[11px] tabular-nums ${subClass ?? "text-fg-faint"}`}>{sub}</div> : null}
    </div>
  );
}

export function RegionRollup({ rollup }: { rollup: RegionRollup }) {
  const maxRegion = Math.max(1, ...rollup.allRegions.map((r) => r.totalRevenue ?? 0));
  const vasTone = achievementTone(rollup.vasPct);

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={eyebrow}>{rollup.region} region — MTD</h2>
        <span className="text-[11px] text-fg-subtle">
          #{rollup.rank.rank} of {rollup.rank.of} regions by revenue
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total Revenue" value={formatCompactCurrency(rollup.totalRevenue)} sub={`Projected ${formatCompactCurrency(rollup.projectedTotalRevenue)}`} />
        <Stat label="VAS Bill" value={formatCompactCurrency(rollup.vasActual)} sub={`Target ${formatCompactCurrency(rollup.vasTarget)}`} />
        <Stat label="VAS % of target" value={formatPercent(rollup.vasPct)} sub="month-to-date" subClass={TONE_TEXT[vasTone]} />
        <Stat label="Working days" value={`${rollup.workingDays.elapsed} / ${rollup.workingDays.total}`} sub="elapsed / total" />
      </div>

      <div className="mt-4 border-t border-border-subtle pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">Total Revenue Stream — all regions</div>
        <div className="mt-2 space-y-1.5">
          {rollup.allRegions.map((r) => (
            <div key={r.region} className="flex items-center gap-2 text-[11px]">
              <span className={`w-14 shrink-0 ${r.region === rollup.region ? "font-semibold text-fg" : "text-fg-subtle"}`}>{r.region}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-surface-2">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${((r.totalRevenue ?? 0) / maxRegion) * 100}%`,
                    background: REGION_COLOR[r.region],
                    opacity: r.region === rollup.region ? 1 : 0.45,
                  }}
                />
              </div>
              <span className="w-20 shrink-0 text-right tabular-nums text-fg-subtle">{formatCompactCurrency(r.totalRevenue)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
