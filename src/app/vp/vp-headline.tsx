import { formatCompactCurrency } from "@/lib/format";
import type { TglossException, VpScopeMetrics } from "@/lib/vp-data";

/**
 * The Executive Overview's "read this first" line (2026-09-28, at the VP's
 * request for a one-line "so what" instead of making him piece the story
 * together from 5 cards and a grid). Exactly one sentence, chosen by
 * priority from real, already-computed numbers — same "not AI, not
 * invented" philosophy as dashboard/insights-panel.tsx, just capped at one
 * line instead of a bulleted list (the detailed exceptions banner and full
 * grid still exist right below for anyone who wants more).
 *
 * Priority: a meaningful month-over-month move on Total Revenue Stream
 * (the number the VP asked to unstub first) beats everything else; then the
 * worst TGLOSS exception; then a plain "on track" when there's genuinely
 * nothing to flag.
 */
export function buildVpHeadline(input: {
  group: VpScopeMetrics;
  lastMonthScope: VpScopeMetrics | null;
  tglossExceptions: TglossException[];
}): string {
  const { group, lastMonthScope, tglossExceptions } = input;

  const current = group.totalRevenueStreamMtd;
  const lastMonth = lastMonthScope?.totalRevenueStreamMtd ?? null;
  if (current !== null && lastMonth !== null && lastMonth !== 0) {
    const pct = ((current - lastMonth) / lastMonth) * 100;
    // Below ~3% is noise at this level of aggregation — not worth leading with.
    if (Math.abs(pct) >= 3) {
      const dir = pct >= 0 ? "up" : "down";
      return `Total Revenue Stream is ${dir} ${Math.abs(Math.round(pct))}% versus this time last month (${formatCompactCurrency(lastMonth)} → ${formatCompactCurrency(current)}).`;
    }
  }

  const critical = tglossExceptions.filter((e) => e.tone === "critical");
  if (critical.length > 0) {
    const worst = critical[0]; // computeTglossExceptions already sorts worst-first
    return worst.requiredRatePerDay !== null
      ? `${worst.branch} is the one to watch — critically behind pace on TGLOSS, needing ${formatCompactCurrency(worst.requiredRatePerDay)}/day for the rest of the month.`
      : `${worst.branch} is the one to watch — critically behind pace on TGLOSS this month.`;
  }

  const warn = tglossExceptions.filter((e) => e.tone === "warn");
  if (warn.length > 0) {
    return `${warn.length} branch${warn.length === 1 ? " is" : "es are"} trailing pace on TGLOSS this month — see below.`;
  }

  return "Every branch is tracking on pace this month — nothing needs your attention right now.";
}

export function VpHeadline({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-lg border border-accent/25 bg-accent-soft/30 px-4 py-3 text-[13.5px] font-medium leading-relaxed text-fg">
      {text}
    </div>
  );
}
