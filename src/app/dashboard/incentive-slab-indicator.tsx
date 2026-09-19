"use client";

import { useState } from "react";
import type { IncentiveSlabTargets } from "@/lib/incentive-slabs/store";
import { formatCompact } from "@/lib/format";
import { computePace } from "@/lib/pace";

/**
 * Four concentric rings — Slab 1 innermost through Slab 4 outermost —
 * showing how far a branch has progressed through its own incentive slab
 * targets this month. Threshold-crossed, not percentage-filled: a ring is
 * either fully achieved (green) or fully pending (grey), and achievement is
 * cumulative (crossing Slab 3 also lights up 1 and 2) — see
 * computeSlabsAchieved() below, kept separate from the SVG so the logic is
 * unit-testable without rendering anything.
 *
 * Every branch evaluates against its *own* slab thresholds (loaded from
 * incentive_slab_targets for the viewed month) — two branches with the same
 * Actual can land on different slabs.
 *
 * Ring color is strictly actual-vs-target (achieved=green, pending=grey) —
 * never the forecast. Fixed 2026-09-19 after a reported bug: on 2026-09-17
 * CO01A showed "Current Slab: Not Achieved" (0 of 4 slabs) but all four
 * rings rendered dashed green because they were merely on-track per
 * computePace()'s projection — a projected number must never paint a
 * still-pending ring green. Forecast now only ever appears as the
 * `forecastText` line below the rings and inside each pending ring's
 * tooltip, both explicitly labelled as a forecast/projection, never as
 * achievement status — see ringTooltip() below. Projection reuses
 * computePace() as-is (simple actual÷daysElapsed×daysInMonth run rate, the
 * same math already driving the VAS Bill target card elsewhere on this page)
 * rather than a working-day-aware variant.
 */

const GREEN = "var(--color-good-solid)";
const GREY = "var(--color-border-strong)";

// viewBox is a fixed 100x100 unit square regardless of the rendered size
// (set by the `size` prop via width/height) — keeps the ring math simple and
// the component crisp at any scale.
const STROKE = 7;
const GAP = 3.5;
const RADII = [14, 14 + STROKE + GAP, 14 + 2 * (STROKE + GAP), 14 + 3 * (STROKE + GAP)] as const; // slab1..slab4, innermost to outermost
const CENTER = 50;
// The visible ring is thin (STROKE); hovering it precisely at the card's
// compact render size was fiddly (confirmed by the user 2026-09-18). Each
// ring gets a second, invisible hit-target circle exactly PITCH wide —
// PITCH is the center-to-center spacing between adjacent rings, so two
// neighbors' hit zones meet edge-to-edge with no dead zone in the gap
// between them and no overlap into each other.
const PITCH = STROKE + GAP;

export type SlabAchievement = { achievedCount: 0 | 1 | 2 | 3 | 4; ringGreen: [boolean, boolean, boolean, boolean] };

/** How many of the branch's four slabs `actual` has crossed, and which
 * rings should render green. Pure function — no rendering, no formatting —
 * so the cumulative-threshold rule can be checked directly. Equal-to-target
 * counts as achieved (>=, matching the spec). */
export function computeSlabsAchieved(actual: number | null, slabs: IncentiveSlabTargets): SlabAchievement {
  const thresholds = [slabs.slab1, slabs.slab2, slabs.slab3, slabs.slab4];
  const achievedCount = (actual === null ? 0 : thresholds.filter((t) => actual >= t).length) as 0 | 1 | 2 | 3 | 4;
  // filter() counting "how many thresholds cleared" only equals the intended
  // cumulative slab number when thresholds are ascending (slab1<slab2<slab3<slab4),
  // which is the whole premise of "slab-wise" targets — not re-validated here.
  const ringGreen: [boolean, boolean, boolean, boolean] = [achievedCount >= 1, achievedCount >= 2, achievedCount >= 3, achievedCount >= 4];
  return { achievedCount, ringGreen };
}

const currencyFull = (value: number | null) => (value === null ? "—" : `₹${formatCompact(value)}`);

/** Achievement is strictly actual-vs-target — a forecast can never make this
 * "achieved". Kept as its own type (not reused from computeSlabsAchieved's
 * boolean[]) so the tooltip/ring-fill code can't accidentally be handed a
 * projected value where an achieved one is expected. */
type RingStatus = "achieved" | "projected" | "pending";

function ringTooltip(slabNumber: 1 | 2 | 3 | 4, target: number, actual: number | null, projectedEom: number | null, status: RingStatus): string {
  // The forecast line is always labelled "Forecast" and always separate from
  // Status — it describes a still-pending ring's trajectory, never its
  // current achievement. Shown for every pending ring with a forecast
  // available, not just ones on track to clear — a ring that's short of pace
  // (like CO01B's, confirmed 2026-09-18) needs the projected figure just as
  // much, so it's clear *why* it's pending, not just that it is.
  const forecastLine = status === "pending" && projectedEom !== null ? `\nForecast (projected month-end): ${currencyFull(projectedEom)}` : "";
  return `Slab ${slabNumber}\n\nTarget: ${currencyFull(target)}\nActual: ${currencyFull(actual)}${forecastLine}\nStatus: ${status === "achieved" ? "Achieved" : status === "projected" ? "Projected (On Track)" : "Pending"}`;
}

export function IncentiveSlabIndicator({
  scopeLabel,
  actual,
  slabs,
  date,
  size = 108,
  /** The KPI card this renders inside already shows Actual as its own big
   * headline number — repeating it under the rings there would be pure
   * duplication, so the embedded (scope-switcher-driven) use case turns it
   * off. The branch-grid use case (if this is ever placed that way again)
   * would want it back on, since there's no other place showing that number. */
  showActual = true,
}: {
  /** What to print in the ring's center and use in the tooltip/aria-label — a branch code, a region name, or "All". Purely a label; doesn't affect which slabs/actual are evaluated. */
  scopeLabel: string;
  actual: number | null;
  /** Undefined when no target was uploaded/aggregated for this scope this month — shown as a muted placeholder rather than hidden. */
  slabs: IncentiveSlabTargets | undefined;
  /** The viewed report date — feeds computePace() for the "at this rate…" forecast text/tooltip below and inside the rings. Omit to skip the forecast entirely; ring fill (achieved/pending) is unaffected either way. */
  date?: string;
  size?: number;
  showActual?: boolean;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!slabs) {
    return (
      <div className="flex flex-col items-center gap-1 text-center" title={`${scopeLabel} — no incentive slab target set for this month`}>
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
          {RADII.map((r, i) => (
            <circle key={i} cx={CENTER} cy={CENTER} r={r} fill="none" stroke={GREY} strokeWidth={STROKE} strokeOpacity={0.4} />
          ))}
        </svg>
        <div className="text-[9px] text-fg-faint">No target set</div>
      </div>
    );
  }

  const { achievedCount, ringGreen } = computeSlabsAchieved(actual, slabs);
  const thresholds = [slabs.slab1, slabs.slab2, slabs.slab3, slabs.slab4];
  const currentSlabLabel = achievedCount === 0 ? "Not Achieved" : String(achievedCount);

  // Forecast: where the metric lands by month-end at the current run rate
  // (computePace — target is irrelevant to projectedEom, only actual/date,
  // so it's passed null), evaluated against the same slabs. This never feeds
  // ring color/fill — see the RingStatus/ringGreen-only comparison below —
  // it only drives the "at this rate…" text and each pending ring's tooltip.
  const projectedEom = date ? computePace(date, actual, null).projectedEom : null;
  const projected = projectedEom !== null ? computeSlabsAchieved(projectedEom, slabs) : null;

  // The "at this rate..." line below the rings (2026-09-18, at the user's
  // request) — three cases, confirmed with the user: projection doesn't
  // clear Slab 1 at all; projection matches what's already achieved (rate
  // holding steady, shown anyway per the user's choice); projection clears a
  // slab beyond what's achieved today. projectedAchievedCount can never be
  // lower than achievedCount — projecting forward from a non-negative run
  // rate only ever adds to the total.
  const forecastText =
    projected === null
      ? null
      : projected.achievedCount === 0
        ? "Not on track for Slab 1"
        : projected.achievedCount === achievedCount
          ? `On track to hold Slab ${projected.achievedCount}`
          : `At this rate, would reach Slab ${projected.achievedCount}`;

  const maxTarget = thresholds[3];
  const actualWidth = Math.min(100, maxTarget > 0 ? ((actual ?? 0) / maxTarget) * 100 : 0);

  return (
    <>
      <div className="flex flex-col items-center gap-1 text-center">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg
            viewBox="0 0 100 100"
            width={size}
            height={size}
            role="img"
            aria-label={`${scopeLabel}: current slab ${currentSlabLabel}, actual ${currencyFull(actual)}. Click for details.`}
          >
            {RADII.map((r, i) => {
              const slabNumber = (i + 1) as 1 | 2 | 3 | 4;
              const isProjected = projected && projected.ringGreen[i] && !ringGreen[i];
              // Ring fill is achieved-vs-pending only — actual compared straight
              // against this slab's own threshold, never the forecast.
              const status: RingStatus = ringGreen[i] ? "achieved" : isProjected ? "projected" : "pending";
              const tooltip = ringTooltip(slabNumber, thresholds[i], actual, projectedEom, status);
              return (
                <g key={slabNumber} className="cursor-default">
                  <circle
                    cx={CENTER}
                    cy={CENTER}
                    r={r}
                    fill="none"
                    stroke={status === "achieved" || status === "projected" ? GREEN : GREY}
                    strokeWidth={STROKE}
                    strokeDasharray={status === "projected" ? "4 4" : undefined}
                    pointerEvents="none"
                  />
                  {/* Invisible, much wider hit target on top of the same ring — see PITCH comment above. */}
                  <circle cx={CENTER} cy={CENTER} r={r} fill="none" stroke="transparent" strokeWidth={PITCH} pointerEvents="stroke">
                    <title>{tooltip}</title>
                  </circle>
                </g>
              );
            })}
          </svg>
        </button>

        <div className="leading-tight">
          <div className="text-[9px] uppercase tracking-wide text-fg-faint">Current Slab</div>
          <div className={`text-xs font-semibold ${achievedCount === 0 ? "text-fg-faint" : "text-good"}`}>{currentSlabLabel}</div>
        </div>
        {forecastText ? <div className="text-[9px] text-fg-faint">{forecastText}</div> : null}
        {showActual ? <div className="text-[9px] tabular-nums text-fg-faint">{currencyFull(actual)}</div> : null}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div className="relative w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-lg font-semibold text-fg">Slab Details: {scopeLabel}</h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded p-1 text-fg-muted hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                aria-label="Close"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            
            <div className="p-5">
              {/* Progress Bar */}
              <div className="mb-8">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-medium text-fg">Actual Progress</span>
                  <span className="font-semibold text-fg">{currencyFull(actual)}</span>
                </div>
                <div className="relative h-4 w-full rounded-full bg-surface-2 overflow-hidden">
                  <div className="absolute left-0 top-0 h-full bg-good-solid transition-all duration-500" style={{ width: `${actualWidth}%` }} />
                </div>
                <div className="relative mt-2 h-4 w-full text-[10px] text-fg-faint">
                  {thresholds.map((t, i) => {
                    const pos = Math.min(100, maxTarget > 0 ? (t / maxTarget) * 100 : 0);
                    return (
                      <div key={i} className="absolute flex flex-col items-center -translate-x-1/2" style={{ left: `${pos}%`, top: '-1.25rem' }}>
                        <div className="h-4 w-px bg-border-strong mb-1" />
                        <span>S{i+1}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Table / List */}
              <div className="divide-y divide-border rounded-lg border border-border">
                <div className="grid grid-cols-4 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-fg-faint bg-surface-2 rounded-t-lg">
                  <div>Slab</div>
                  <div className="text-right">Target</div>
                  <div className="text-right">Status</div>
                  <div className="text-right">Forecast</div>
                </div>
                {thresholds.map((t, i) => {
                  const slabNumber = (i + 1) as 1 | 2 | 3 | 4;
                  const isProjected = projected && projected.ringGreen[i] && !ringGreen[i];
                  const status: RingStatus = ringGreen[i] ? "achieved" : isProjected ? "projected" : "pending";
                  
                  let statusBadge;
                  if (status === "achieved") {
                    statusBadge = <span className="rounded bg-good-soft px-1.5 py-0.5 text-good">Achieved</span>;
                  } else if (status === "projected") {
                    statusBadge = <span className="rounded border border-good/40 bg-surface px-1.5 py-0.5 text-good border-dashed">On Track</span>;
                  } else {
                    statusBadge = <span className="rounded bg-surface-2 px-1.5 py-0.5 text-fg-subtle">Pending</span>;
                  }

                  return (
                    <div key={slabNumber} className="grid grid-cols-4 items-center px-4 py-3 text-sm">
                      <div className="font-medium text-fg">Slab {slabNumber}</div>
                      <div className="text-right tabular-nums text-fg">{currencyFull(t)}</div>
                      <div className="text-right text-[11px] font-medium">{statusBadge}</div>
                      <div className="text-right tabular-nums text-fg-subtle">
                        {status === "pending" && projectedEom ? currencyFull(projectedEom) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
