import { formatCompactCurrency } from "@/lib/format";
import type { TglossException } from "@/lib/vp-data";
import { tglossText } from "@/components/tgloss-text";

/**
 * "Exception surfacing" (2026-09-25, at the VP's request) — instead of
 * making the VP scan every branch in the grid below to find a problem, this
 * does the scanning for them. Graded purely against each branch's own
 * TGLOSS incentive-slab target and today's pace, never a week/month-over-
 * month comparison (the VP's original brief ruled those out) — see
 * computeTglossExceptions() in lib/vp-data.ts.
 */
export function VpExceptionsBanner({ exceptions }: { exceptions: TglossException[] }) {
  if (exceptions.length === 0) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-good/30 bg-good-soft px-4 py-2.5 text-[12px] font-medium text-good">
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Every branch is on pace for {tglossText("TGLOSS")} this month.
      </div>
    );
  }

  const shown = exceptions.slice(0, 6);
  const hiddenCount = exceptions.length - shown.length;

  return (
    <div className="mt-4 rounded-xl border border-warn/30 bg-warn-soft/40 px-4 py-3">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-warn">
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 2a1 1 0 01.894.553l7 14A1 1 0 0117 18H3a1 1 0 01-.894-1.447l7-14A1 1 0 0110 2zm0 6a1 1 0 00-1 1v3a1 1 0 002 0V9a1 1 0 00-1-1zm0 7a1 1 0 100 2 1 1 0 000-2z" />
        </svg>
        {exceptions.length} branch{exceptions.length === 1 ? "" : "es"} off pace for this month&apos;s {tglossText("TGLOSS")} target
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {shown.map((e) => (
          <div
            key={e.branch}
            className={`rounded-md px-2.5 py-1.5 text-[11px] ${e.tone === "critical" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}
            title={`${e.branch} — ${formatCompactCurrency(e.actual)} of ${formatCompactCurrency(e.target)} target`}
          >
            <span className="font-semibold">{e.branch}</span>
            {e.gap !== null ? <span className="ml-1.5 tabular-nums">gap {formatCompactCurrency(e.gap)}</span> : null}
            {e.requiredRatePerDay !== null ? (
              <span className="ml-1.5 tabular-nums opacity-80">· needs {formatCompactCurrency(e.requiredRatePerDay)}/day</span>
            ) : null}
          </div>
        ))}
        {hiddenCount > 0 ? <span className="self-center text-[11px] text-fg-faint">+{hiddenCount} more — see Regions</span> : null}
      </div>
    </div>
  );
}
