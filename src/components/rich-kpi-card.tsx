import { achievementRatio, achievementTone, type AchievementTone } from "@/lib/aggregate";
import { formatNumber } from "@/lib/format";
import type { Pace } from "@/lib/pace";
import { Sparkline } from "./sparkline";

const TONE_BAR: Record<AchievementTone, string> = {
  good: "bg-good-solid",
  warn: "bg-warn-solid",
  critical: "bg-bad-solid",
  neutral: "bg-surface-3",
};
const TONE_TEXT: Record<AchievementTone, string> = {
  good: "text-good",
  warn: "text-warn",
  critical: "text-bad",
  neutral: "text-fg-faint",
};

// Decorative icon tint per card — not a status signal, so these map to
// neutral/brand token pairs rather than the good/warn/bad tones.
const ICON_BG: Record<string, string> = {
  red: "bg-accent-soft text-accent-text",
  blue: "bg-info-soft text-info",
  amber: "bg-warn-soft text-warn",
  emerald: "bg-good-soft text-good",
  violet: "bg-info-soft text-info",
  indigo: "bg-info-soft text-info",
};

/** Icon + value + "vs Target" bar — the mockup's KPI-card format, built from
 * real achievement ratios (no "vs Last Month" trend: that needs a prior
 * calendar month of real uploads, which doesn't exist yet — omitted rather
 * than fabricated).
 *
 * `pace`/`sparklineValues` are both optional and independent: a card with a
 * target shows Gap + Run rate/Required rate under the bar (pace only); a
 * card with no target shows a sparkline + plain run rate instead, since
 * there's no "required" pace without something to require it toward. */
export function RichKpiCard({
  icon,
  color,
  label,
  value,
  sub,
  actual,
  target,
  hasPreviousUpload,
  pace,
  sparklineValues,
  formatPaceValue = formatNumber,
  showSparkline = true,
}: {
  icon: React.ReactNode;
  color: keyof typeof ICON_BG;
  label: string;
  value: string;
  sub?: string;
  /** Omit both to show a plain card with no target bar (e.g. GUS RO MTD, which has no confirmed target). */
  actual?: number | null;
  target?: number | null;
  /** Whether there's a previous upload to compare against — shown as a footer note. Omit to skip the footer entirely. */
  hasPreviousUpload?: boolean;
  /** Run-rate/required-rate/gap for this metric — see lib/pace.ts. Only rendered when `actual`/`target` are also provided. */
  pace?: Pace;
  /** Day-by-day actual values for the month, for the sparkline — only shown when there's no target bar taking that space instead. */
  sparklineValues?: (number | null)[];
  /** How to format pace figures (Rs vs plain count) — defaults to the same formatter as the headline value. */
  formatPaceValue?: (v: number | null) => string;
  /** Off to drop the drawn chart line while keeping the "Run rate X/day" text — for a branch admin's numbers-only dashboard, where the line itself is exactly the kind of chart they asked not to see, but the run rate figure is still a plain number worth keeping. */
  showSparkline?: boolean;
}) {
  const hasTarget = actual !== undefined && target !== undefined;
  const ratio = hasTarget ? achievementRatio(actual, target) : null;
  const tone = achievementTone(ratio);
  const widthPct = ratio === null ? 0 : Math.min(100, Math.max(0, ratio * 100));

  const tooltip = hasTarget
    ? `${label}: ${formatNumber(actual)} of ${formatNumber(target)} target${hasPreviousUpload === false ? " · first upload" : ""}`
    : `${label}: ${value}${sub ? ` (${sub})` : ""}${hasPreviousUpload === false ? " · first upload" : ""}`;

  return (
    <div className="flex h-full flex-col justify-between rounded-lg border border-border bg-surface p-4" title={tooltip}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-fg-subtle">{label}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-fg">{value}</div>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ICON_BG[color]}`}>{icon}</div>
      </div>

      {hasTarget ? (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${widthPct}%` }} />
          </div>
          <div className={`mt-1 text-[11px] font-medium tabular-nums ${TONE_TEXT[tone]}`}>
            {ratio === null ? "no target set" : `${Math.round(ratio * 100)}% of target`}
          </div>
          {pace ? (
            <div className="mt-1.5 space-y-0.5 text-[10px] text-fg-faint">
              {pace.gap !== null && pace.gap > 0 ? (
                <div title={`Gap to target: ${formatPaceValue(pace.gap)}`}>
                  Gap <span className="font-medium text-fg-muted">{formatPaceValue(pace.gap)}</span>
                  {pace.requiredRatePerDay !== null ? (
                    <>
                      {" · Required "}
                      <span className="font-medium text-fg-muted">{formatPaceValue(pace.requiredRatePerDay)}/day</span>
                    </>
                  ) : null}
                </div>
              ) : pace.gap !== null ? (
                <div className="text-good">Target already met</div>
              ) : null}
              {pace.runRatePerDay !== null ? (
                <div title={`Current run rate: ${formatPaceValue(pace.runRatePerDay)} per day`}>
                  Run rate <span className="font-medium text-fg-muted">{formatPaceValue(pace.runRatePerDay)}/day</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (showSparkline && sparklineValues && sparklineValues.filter((v) => v !== null).length >= 2) ||
        (pace?.runRatePerDay !== null && pace?.runRatePerDay !== undefined) ? (
        <div className="mt-2">
          {showSparkline && sparklineValues && sparklineValues.filter((v) => v !== null).length >= 2 ? (
            <Sparkline values={sparklineValues} color={tone === "neutral" ? "#94a3b8" : undefined} />
          ) : null}
          {pace?.runRatePerDay !== null && pace?.runRatePerDay !== undefined ? (
            <div className={showSparkline ? "mt-0.5 text-[10px] text-fg-faint" : "text-[10px] text-fg-faint"}>
              Run rate <span className="font-medium text-fg-muted">{formatPaceValue(pace.runRatePerDay)}/day</span>
            </div>
          ) : null}
        </div>
      ) : sub ? (
        <div className="mt-3 text-[11px] text-fg-faint">{sub}</div>
      ) : null}

      {hasPreviousUpload !== undefined ? (
        <div className="pt-2 text-[10px] text-fg-faint">{hasPreviousUpload ? "vs last upload" : "first upload"}</div>
      ) : null}
    </div>
  );
}
