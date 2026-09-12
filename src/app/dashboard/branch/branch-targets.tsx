import type { TargetStat } from "@/lib/branch-view-data";
import { achievementTone, type AchievementTone } from "@/lib/aggregate";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import { eyebrow } from "@/lib/ui";

const TONE_TEXT: Record<AchievementTone, string> = {
  good: "text-good",
  warn: "text-warn",
  critical: "text-bad",
  neutral: "text-fg-faint",
};
const TONE_BAR: Record<AchievementTone, string> = {
  good: "bg-good-solid",
  warn: "bg-warn-solid",
  critical: "bg-bad-solid",
  neutral: "bg-surface-3",
};

// VAS / Offtake / Parts Retail are ₹; BPU / PM+OC are counts.
const RUPEE_KEYS = new Set(["vas", "offtake", "partsRetail"]);

function Card({ s }: { s: TargetStat }) {
  const fmt = RUPEE_KEYS.has(s.key) ? formatCompactCurrency : formatNumber;
  // VAS's target moves with RO count, so its plain ratio grades it. The
  // fixed-target metrics are graded on pace — being at 20% of a month-end
  // target on working-day 9 isn't "critical", it's roughly on track.
  const grade = s.mtdTarget ? s.ratio : s.paceRatio;
  const tone = achievementTone(grade);
  const barPct = s.ratio === null ? 0 : Math.min(100, Math.round(s.ratio * 100));

  const paceHint = (() => {
    if (s.mtdTarget || s.paceRatio === null) return null;
    if (s.paceRatio >= 1) return "on / ahead of pace";
    return `${formatPercent(1 - s.paceRatio)} behind pace`;
  })();

  return (
    <div className="rounded-md border border-border-subtle p-2.5">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">{s.label}</span>
        {s.rank ? (
          <span className="text-[9px] tabular-nums text-fg-faint">
            #{s.rank.rank}/{s.rank.of}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-fg">{fmt(s.mtd)}</div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${barPct}%` }} />
      </div>
      <div className={`mt-1 text-[11px] font-medium tabular-nums ${TONE_TEXT[tone]}`}>
        {s.ratio === null ? "no target" : `${formatPercent(s.ratio)} of target`}
      </div>
      {paceHint ? <div className="text-[10px] text-fg-faint">{paceHint}</div> : null}
    </div>
  );
}

export function BranchTargets({ stats }: { stats: TargetStat[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className={eyebrow}>Targets — MTD</h2>
        <span className="text-[10px] text-fg-faint">fixed-target metrics graded on pace</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.key} s={s} />
        ))}
      </div>
    </div>
  );
}
