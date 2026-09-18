import type { IncentiveSlabTargets } from "@/lib/incentive-slabs/store";
import { formatNumber } from "@/lib/format";

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
 */

const GREEN = "var(--color-good-solid)";
const GREY = "var(--color-border-strong)";

// viewBox is a fixed 100x100 unit square regardless of the rendered size
// (set by the `size` prop via width/height) — keeps the ring math simple and
// the component crisp at any scale.
const STROKE = 6;
const GAP = 3;
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

const currencyFull = (value: number | null) => (value === null ? "—" : `₹${formatNumber(value)}`);

function ringTooltip(slabNumber: 1 | 2 | 3 | 4, target: number, actual: number | null, achieved: boolean): string {
  return `Slab ${slabNumber}\n\nTarget: ${currencyFull(target)}\nActual: ${currencyFull(actual)}\nStatus: ${achieved ? "Achieved" : "Pending"}`;
}

export function IncentiveSlabIndicator({
  scopeLabel,
  actual,
  slabs,
  size = 92,
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
  size?: number;
  showActual?: boolean;
}) {
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

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label={`${scopeLabel}: current slab ${currentSlabLabel}, actual ${currencyFull(actual)}`}
      >
        {RADII.map((r, i) => {
          const slabNumber = (i + 1) as 1 | 2 | 3 | 4;
          const tooltip = ringTooltip(slabNumber, thresholds[i], actual, ringGreen[i]);
          return (
            <g key={slabNumber} className="cursor-default">
              <circle cx={CENTER} cy={CENTER} r={r} fill="none" stroke={ringGreen[i] ? GREEN : GREY} strokeWidth={STROKE} pointerEvents="none" />
              {/* Invisible, much wider hit target on top of the same ring — see PITCH comment above. */}
              <circle cx={CENTER} cy={CENTER} r={r} fill="none" stroke="transparent" strokeWidth={PITCH} pointerEvents="stroke">
                <title>{tooltip}</title>
              </circle>
            </g>
          );
        })}
      </svg>

      <div className="leading-tight">
        <div className="text-[9px] uppercase tracking-wide text-fg-faint">Current Slab</div>
        <div className={`text-xs font-semibold ${achievedCount === 0 ? "text-fg-faint" : "text-good"}`}>{currentSlabLabel}</div>
      </div>
      {showActual ? <div className="text-[9px] tabular-nums text-fg-faint">{currencyFull(actual)}</div> : null}
    </div>
  );
}
