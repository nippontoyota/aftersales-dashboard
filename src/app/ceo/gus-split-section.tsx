import type { GusSplitBreakdown } from "@/lib/gus-split";
import { formatNumber, formatPercent } from "@/lib/format";

/**
 * GUS composition (PM/PDI/Accessories/General Repair) — built from Service
 * Info Report job lines, see gus-split.ts's module doc comment for the
 * classification rules and why its total is its own figure rather than
 * forced to equal GUS MTD elsewhere on this page.
 */
const CATEGORIES: { key: keyof Omit<GusSplitBreakdown, "total">; label: string; bar: string }[] = [
  { key: "pm", label: "PM", bar: "bg-good-solid" },
  { key: "pdi", label: "PDI", bar: "bg-info-solid" },
  { key: "accessories", label: "Accessories", bar: "bg-violet" },
  { key: "generalRepair", label: "General Repair", bar: "bg-warn-solid" },
];

export function GusSplitSection({ split }: { split: GusSplitBreakdown }) {
  if (split.total === 0) return null;

  return (
    <>
      <h2 className="mt-10 text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">GUS Composition — MTD</h2>
      <div className="mt-4 rounded-xl border border-border-subtle bg-surface/60 p-5 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-md">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border-subtle">
          {CATEGORIES.map(({ key, bar }) => {
            const pct = split[key] / split.total;
            return pct > 0 ? <div key={key} className={`h-full ${bar}`} style={{ width: `${pct * 100}%` }} /> : null;
          })}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map(({ key, label, bar }) => (
            <div key={key}>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${bar}`} />
                <span className="text-[10.5px] text-fg-faint">{label}</span>
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-fg">{formatNumber(split[key])}</div>
              <div className="text-[10.5px] text-fg-faint">{formatPercent(split.total > 0 ? split[key] / split.total : null)}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10.5px] text-fg-faint">
          {formatNumber(split.total)} repair orders from Service Info Report job lines — a separate count from BA Tool&apos;s GUS
          MTD figure above, which can run a small amount apart from this total.
        </p>
      </div>
    </>
  );
}
