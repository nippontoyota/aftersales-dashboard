import type { GusSplitBreakdown } from "@/lib/gus-split";
import { formatNumber, formatPercent } from "@/lib/format";

/**
 * GUS composition (PM/PDI/Accessories/General Repair) — built from Service
 * Info Report job lines, see gus-split.ts's module doc comment for the
 * classification rules and why its total is its own figure rather than
 * forced to equal GUS MTD elsewhere on this page.
 *
 * Rendered as four tiles matching the plain Used-Oil/Scrap-Revenue tiles
 * right next to GUS for the Month (2026-10-06, at the user's request — was
 * previously its own big standalone panel further down the page; moved into
 * the Group KPIs grid so it reads as part of the same row of figures
 * instead of a separate section).
 */
const CATEGORIES: { key: keyof Omit<GusSplitBreakdown, "total">; label: string; dot: string }[] = [
  { key: "pm", label: "PM", dot: "bg-good-solid" },
  { key: "pdi", label: "PDI", dot: "bg-info-solid" },
  { key: "accessories", label: "Accessories", dot: "bg-violet" },
  { key: "generalRepair", label: "General Repair", dot: "bg-warn-solid" },
];

export function GusSplitTiles({ split }: { split: GusSplitBreakdown }) {
  if (split.total === 0) return null;

  return (
    <>
      {CATEGORIES.map(({ key, label, dot }) => (
        <div
          key={key}
          className="group relative overflow-hidden rounded-lg border border-border-subtle bg-surface/60 p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
          title={`${label}: ${formatNumber(split[key])} of ${formatNumber(split.total)} GUS ROs (Service Info Report)`}
        >
          <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-fg-subtle">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
            {label} · GUS Split
          </div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-fg">{formatNumber(split[key])}</div>
          <div className="mt-1 text-[11px] text-fg-faint transition-colors duration-200 group-hover:text-fg-subtle">
            {formatPercent(split[key] / split.total)} of {formatNumber(split.total)} ROs
          </div>
        </div>
      ))}
    </>
  );
}
