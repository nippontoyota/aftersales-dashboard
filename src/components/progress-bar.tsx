import { achievementRatio, achievementTone, hasActualWithoutTarget, type AchievementTone } from "@/lib/aggregate";
import { formatNumber } from "@/lib/format";

const TONE_STYLES: Record<AchievementTone, { bg: string; text: string; fill: string }> = {
  good: { bg: "bg-good-soft", text: "text-good", fill: "bg-good-solid" },
  warn: { bg: "bg-warn-soft", text: "text-warn", fill: "bg-warn-solid" },
  critical: { bg: "bg-bad-soft", text: "text-bad", fill: "bg-bad-solid" },
  neutral: { bg: "bg-surface-2", text: "text-fg-subtle", fill: "bg-surface-3" },
};

/** Real activity with no target to grade it against — see
 * lib/aggregate.ts's hasActualWithoutTarget. Same sky-blue treatment as the
 * branch heatmap, so the badge shows the actual figure instead of a bare
 * "—" that reads identically to genuinely no data. */
const NO_TARGET_ACTIVITY_STYLE = { bg: "bg-info-soft", text: "text-info", fill: "bg-info-solid" };

/**
 * Target-vs-achievement cell, redesigned for a glance-and-read scorecard
 * feel: one colored status badge (the answer to "is this good?") plus a
 * thin fill bar, no stacked lines of secondary numbers competing for
 * attention. The exact actual/target/delta are still there — in a native
 * title tooltip — for anyone who wants to dig in, not forced onto the page.
 */
export function ProgressCell({
  actual,
  target,
  caption,
  formatValue = formatNumber,
}: {
  actual: number | null;
  target: number | null;
  /** Shown only in the hover tooltip now, e.g. "+42 vs previous upload". */
  caption?: string | null;
  formatValue?: (value: number | null) => string;
}) {
  const ratio = achievementRatio(actual, target);
  const tone = achievementTone(ratio);
  const activityOnly = hasActualWithoutTarget(actual, target);
  const styles = activityOnly ? NO_TARGET_ACTIVITY_STYLE : TONE_STYLES[tone];
  const widthPct = ratio === null ? 0 : Math.min(100, Math.max(0, ratio * 100));

  const tooltipParts = [
    `Actual: ${formatValue(actual)}`,
    activityOnly ? "no target set" : `Target: ${formatValue(target)}`,
    caption ? caption : null,
  ].filter(Boolean);

  return (
    <div className="w-24" title={tooltipParts.join(" · ")}>
      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${styles.bg} ${styles.text}`}>
        {ratio !== null ? `${Math.round(ratio * 100)}%` : activityOnly ? formatValue(actual) : "—"}
      </span>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${styles.fill}`} style={{ width: `${widthPct}%` }} />
      </div>
      <div className="mt-0.5 text-[10px] tabular-nums text-fg-faint">{formatValue(actual)}</div>
    </div>
  );
}
