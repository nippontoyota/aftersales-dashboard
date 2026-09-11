import type { BranchView } from "@/lib/branch-view-data";
import { achievementTone, type AchievementTone } from "@/lib/aggregate";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import { eyebrow } from "@/lib/ui";

const TONE_HEX: Record<AchievementTone, string> = {
  good: "var(--color-good-solid)",
  warn: "var(--color-warn-solid)",
  critical: "var(--color-bad-solid)",
  neutral: "var(--color-border-strong)",
};

// Semi-circular gauge: 180° sweep, left (0%) to right (100%+).
const W = 240;
const H = 128;
const CX = W / 2;
const CY = H - 14;
const RAD = 94;
const STROKE = 15;

function arc(fromPct: number, toPct: number): string {
  const clamp = (p: number) => Math.min(1, Math.max(0, p));
  const a0 = Math.PI * (1 - clamp(fromPct));
  const a1 = Math.PI * (1 - clamp(toPct));
  const x0 = CX + RAD * Math.cos(a0);
  const y0 = CY - RAD * Math.sin(a0);
  const x1 = CX + RAD * Math.cos(a1);
  const y1 = CY - RAD * Math.sin(a1);
  const large = Math.abs(a0 - a1) > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${RAD} ${RAD} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

export function VasGauge({ view, date }: { view: BranchView; date: string }) {
  const { report, workingDays } = view;
  const ratio = view.vasPct;
  const tone = achievementTone(ratio);
  const fillPct = ratio === null ? 0 : Math.min(1, ratio);

  const actual = report.vasAchievementForTheMonth;
  const target = report.vasBillTarget;
  const gap = actual !== null && target !== null ? target - actual : null;
  const runRate = actual !== null && workingDays.elapsed > 0 ? actual / workingDays.elapsed : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className={eyebrow}>VAS Bill — Target Achievement</h2>
        <span className="text-[10px] text-fg-faint">MTD, as of {date}</span>
      </div>

      <div className="mt-1 flex flex-col items-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[248px]" role="img" aria-label={`VAS at ${formatPercent(ratio)} of the month-to-date target`}>
          <path d={arc(0, 1)} fill="none" stroke="var(--color-border)" strokeWidth={STROKE} strokeLinecap="round" />
          {ratio !== null ? <path d={arc(0, fillPct)} fill="none" stroke={TONE_HEX[tone]} strokeWidth={STROKE} strokeLinecap="round" /> : null}
          <text x={CX} y={CY - 22} textAnchor="middle" className="fill-fg" style={{ fontSize: 26, fontWeight: 700 }}>
            {formatPercent(ratio)}
          </text>
          <text x={CX} y={CY - 5} textAnchor="middle" className="fill-fg-faint" style={{ fontSize: 10 }}>
            of MTD target
          </text>
        </svg>
      </div>

      <dl className="mt-1 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-fg-faint">Actual</dt>
          <dd className="text-xs font-semibold tabular-nums text-fg">{formatCompactCurrency(actual)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-fg-faint">Target</dt>
          <dd className="text-xs font-semibold tabular-nums text-fg">{formatCompactCurrency(target)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-fg-faint">{gap !== null && gap < 0 ? "Ahead by" : "Behind by"}</dt>
          <dd className={`text-xs font-semibold tabular-nums ${gap !== null && gap <= 0 ? "text-good" : "text-fg"}`}>
            {gap === null ? "—" : formatCompactCurrency(Math.abs(gap))}
          </dd>
        </div>
      </dl>

      <p className="mt-2 border-t border-border-subtle pt-2 text-center text-[11px] text-fg-subtle">
        Billing <span className="font-medium tabular-nums text-fg">{formatCompactCurrency(runRate)}/working day</span>
      </p>
    </div>
  );
}
