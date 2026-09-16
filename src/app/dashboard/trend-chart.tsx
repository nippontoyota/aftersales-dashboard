"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TrendPoint } from "@/lib/trend";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/format";
import { computePace } from "@/lib/pace";
import { useSyncedMetric } from "./metric-sync";

type ValueFormatter = (v: number | null) => string;

export type TrendMetricConfig = { key: string; label: string };

/** BPU/Offtake/Parts Retail/PM+OC moved to their own trend chart on the TKM
 * Targets page (2026-08-31) — this default is what's left on the main
 * dashboard's chart. */
const DEFAULT_METRICS: TrendMetricConfig[] = [{ key: "vas", label: "VAS Bill (Rs)" }];

// Stable reference (not `[]` inline at the call site) so a missing metric
// key doesn't hand useMemo a new array identity on every render.
const EMPTY_POINTS: TrendPoint[] = [];

const ACCENT = "var(--color-accent)";
const TARGET_COLOR = "var(--color-fg-faint)";
const GRID_COLOR = "var(--color-border)";

const WIDTH = 640;
const HEIGHT = 220;
const MODAL_HEIGHT = 400;
const PAD = { top: 16, right: 16, bottom: 26, left: 44 };

/** Catmull-Rom → cubic-Bézier smoothing — turns the straight-segment
 * polyline into a gentle curve without inventing values between real
 * points (every original x,y still sits exactly on the curve, this only
 * changes how the pen travels between them). Skipped for target lines
 * (those stay straight/dashed — a smoothed reference line reads as "the
 * target moved," which it didn't) and for anything under 3 points, where
 * a curve has nothing meaningful to bend through. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} `;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} `;
  }
  return d.trim();
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type HoverInfo = { date: string; actual: number | null; target: number | null; isProjected: boolean };

function ExpandIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
    </svg>
  );
}

/** The chart itself — legend, SVG, hover tooltip, footer — shared between
 * the normal card and the expanded modal so they never drift out of sync.
 * The SVG's viewBox is fixed but scales fluidly with its container's width
 * (`w-full`), so rendering this same markup inside a wider modal panel
 * makes it bigger with no separate "large" version to maintain. */
function ChartBody({
  points,
  maxY,
  path,
  areaPath,
  targetPath,
  projectedPath,
  projectedTargetPath,
  projectedPoint,
  extraSlots,
  scaleX,
  scaleY,
  hoverIndex,
  setHoverIndex,
  hovered,
  height,
  gradientId,
  formatValue,
}: {
  points: TrendPoint[];
  maxY: number;
  formatValue: ValueFormatter;
  path: string;
  /** Same curve as `path`, closed down to the baseline — filled with a soft
   * gradient so the line has something to sit on instead of floating on
   * bare white (2026-09-01, at the user's request for more inviting charts). */
  areaPath: string;
  targetPath: string;
  /** Dotted continuation from today's actual/target out to the projected
   * month-end value (2026-09-16, at the user's request — "where will they
   * reach at this rate"). Empty string when there's no date to forecast
   * from, or no days remain in the month. */
  projectedPath: string;
  projectedTargetPath: string;
  projectedPoint: { x: number; y: number } | null;
  /** Extra x-axis slots (one per remaining calendar day) reserved to the
   * right of the real data so the projection has somewhere to run to. 0
   * when there's no forecast, in which case the real data fills the full
   * chart width exactly as before this feature existed. */
  extraSlots: number;
  scaleX: (i: number) => number;
  scaleY: (v: number) => number;
  hoverIndex: number | null;
  setHoverIndex: (i: number | null) => void;
  /** The hovered point's date/actual/target — computed by the parent (not
   * derived here from `points[hoverIndex]`) because `hoverIndex` can now
   * range past the last real point, into the projected region, where there
   * is no real point to look up (see TrendChart's `hoveredInfo`). */
  hovered: HoverInfo | null;
  /** Taller in the expanded modal — same viewBox width, more vertical room to read. */
  height: number;
  /** SVG gradient ids can't repeat across the page (the card and the
   * expanded modal render this same body at once) — each caller passes its
   * own. */
  gradientId: string;
}) {
  const innerH = height - PAD.top - PAD.bottom;
  const gridSteps = 4;
  const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => i / gridSteps);
  const lastIndex = points.length - 1;
  const lastActual = points[lastIndex]?.actual;

  if (points.length === 0) {
    return <div className="mt-4 flex h-[180px] items-center justify-center text-xs text-fg-faint">No uploads yet this month.</div>;
  }

  return (
    <>
      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="w-full touch-none"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
            const innerW = WIDTH - PAD.left - PAD.right;
            // Must match scaleX's domain (real data + reserved projection
            // slots), not just the real data count — otherwise hovering
            // anywhere past the last real point (including the projected
            // region and the true right edge) resolves to a stale index and
            // the tooltip appears to freeze wherever today's data now sits.
            const totalSlots = points.length - 1 + extraSlots;
            const idx = Math.round(((relX - PAD.left) / innerW) * totalSlots);
            setHoverIndex(Math.min(totalSlots, Math.max(0, idx)));
          }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>

          {gridLines.map((g) => {
            const y = PAD.top + g * innerH;
            const value = maxY * (1 - g);
            return (
              <g key={g}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} stroke={GRID_COLOR} strokeWidth={1} />
                <text x={PAD.left - 8} y={y + 3} textAnchor="end" className="fill-fg-faint" fontSize={9.5}>
                  {formatValue(value)}
                </text>
              </g>
            );
          })}

          {areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" /> : null}
          {targetPath ? <path d={targetPath} fill="none" stroke={TARGET_COLOR} strokeWidth={2} strokeDasharray="4 3" strokeLinecap="round" /> : null}
          {path ? <path d={path} fill="none" stroke={ACCENT} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" /> : null}
          {projectedTargetPath ? (
            <path d={projectedTargetPath} fill="none" stroke={TARGET_COLOR} strokeWidth={1.75} strokeDasharray="1 3.5" strokeLinecap="round" opacity={0.85} />
          ) : null}
          {projectedPath ? (
            <path d={projectedPath} fill="none" stroke={ACCENT} strokeWidth={2} strokeDasharray="1 3.5" strokeLinecap="round" opacity={0.8} />
          ) : null}
          {projectedPoint ? (
            <circle cx={projectedPoint.x} cy={projectedPoint.y} r={3.5} fill="var(--color-surface)" stroke={ACCENT} strokeWidth={1.75} />
          ) : null}

          {lastActual !== null && lastActual !== undefined ? (
            <circle cx={scaleX(lastIndex)} cy={scaleY(lastActual)} r={3} fill={ACCENT} stroke="var(--color-surface)" strokeWidth={1.5} />
          ) : null}

          {hoverIndex !== null ? (
            <line x1={scaleX(hoverIndex)} x2={scaleX(hoverIndex)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--color-border-strong)" strokeWidth={1} />
          ) : null}
          {hovered?.actual !== null && hovered?.actual !== undefined && hoverIndex !== null ? (
            <circle cx={scaleX(hoverIndex)} cy={scaleY(hovered.actual)} r={4} fill={ACCENT} stroke="var(--color-surface)" strokeWidth={1.75} />
          ) : null}

          {points.length > 1 ? (
            <>
              <text x={PAD.left} y={height - 8} className="fill-fg-faint" fontSize={10}>
                {formatShortDate(points[0].date)}
              </text>
              <text
                x={scaleX(lastIndex)}
                y={height - 8}
                textAnchor={extraSlots > 0 ? "middle" : "end"}
                className="fill-fg-faint"
                fontSize={10}
              >
                {formatShortDate(points[points.length - 1].date)}
              </text>
              {extraSlots > 0 ? (
                <text x={WIDTH - PAD.right} y={height - 8} textAnchor="end" className="fill-fg-faint" fontSize={10}>
                  Month-end
                </text>
              ) : null}
            </>
          ) : null}
        </svg>

        {hovered ? (
          <div
            className="pointer-events-none absolute top-0 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] shadow-md"
            style={{
              left: `${Math.min(78, Math.max(2, (scaleX(hoverIndex!) / WIDTH) * 100))}%`,
            }}
          >
            <div className="font-medium text-fg-muted">
              {formatShortDate(hovered.date)}
              {hovered.isProjected ? <span className="ml-1 font-normal text-fg-faint">(projected)</span> : null}
            </div>
            <div className="text-fg-subtle">
              Actual <span className="font-semibold tabular-nums text-fg">{formatValue(hovered.actual)}</span>
            </div>
            <div className="text-fg-subtle">
              Target <span className="font-semibold tabular-nums text-fg">{formatValue(hovered.target)}</span>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function TrendChart({
  seriesByMetric,
  metrics = DEFAULT_METRICS,
  compactCurrency = false,
  date,
}: {
  seriesByMetric: Record<string, TrendPoint[]>;
  /** Defaults to the main dashboard's own set (VAS only); the TKM Targets page passes its BPU/Offtake/Parts Retail/PM+OC metrics and series instead. */
  metrics?: TrendMetricConfig[];
  /** Format axis ticks / tooltip values as ₹ crore/lakh instead of the plain
   * grouped number — the branch overview's Total Revenue Stream series runs
   * into crores and the full figure overflows the gutter. (A boolean, not a
   * formatter function, so it stays passable from a server component.) */
  compactCurrency?: boolean;
  /** The page's "as of" date — enables the month-end projection (dotted
   * line + stat row) via lib/pace.ts's run-rate math. Omit entirely to
   * render exactly as before this feature existed (no forecast). */
  date?: string;
}) {
  const formatValue: ValueFormatter = compactCurrency ? formatCompactCurrency : formatNumber;
  const [metric, setMetric] = useSyncedMetric(metrics[0]?.key ?? "");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Drop a stale hover marker when the metric changes under it — e.g. a
  // sibling card (Achievement Donut / Region Scorecard) switched the shared
  // selection while the pointer was still over this chart. (Changing this
  // chart's own dropdown also clears it, in the select's onChange.)
  const [hoverMetric, setHoverMetric] = useState(metric);
  if (metric !== hoverMetric) {
    setHoverMetric(metric);
    setHoverIndex(null);
  }

  const points = seriesByMetric[metric] ?? EMPTY_POINTS;
  const lastPoint = points.length > 0 ? points[points.length - 1] : null;
  const lastActualValue = lastPoint?.actual ?? null;
  const lastTargetValue = lastPoint?.target ?? null;
  const firstTargetValue = points.find((p) => p.target !== null)?.target ?? null;

  // Most targets on this chart are a fixed monthly figure repeated on every
  // day's row (BPU, Offtake, Parts Retail, PM+OC) — but VAS Bill's target is
  // a moving benchmark recomputed daily from GUS RO MTD (see
  // computeVasTrendSeries), so it legitimately grows through the month like
  // actual does. Distinguish by shape rather than hardcoding a metric key:
  // if the earliest observed target this month is under half the latest
  // one, it's been growing, not just fixed with a bit of day-to-day noise
  // from branches that don't report every day (e.g. the online-store code).
  const isTargetMoving = firstTargetValue !== null && lastTargetValue !== null && lastTargetValue !== 0 && firstTargetValue / lastTargetValue < 0.5;

  // Forecast (2026-09-16, at the user's request — "where will they reach at
  // this rate, how much is needed"): reuses lib/pace.ts's run-rate math,
  // same as the Hero KPI strip and TKM Targets cards. `date` is optional —
  // omit it (e.g. a caller with no natural "as of" date) and the chart
  // renders exactly as it did before this feature existed.
  const pace = useMemo(
    () => (date && lastActualValue !== null && lastTargetValue !== null ? computePace(date, lastActualValue, lastTargetValue) : null),
    [date, lastActualValue, lastTargetValue]
  );
  // Only extrapolated when the target is actually moving — treating the
  // target-so-far as its own "actual" purely to linearly project where that
  // benchmark lands by month-end. For a fixed target this would wrongly
  // "project" a constant value upward just because it's mid-month; a fixed
  // target's own projection is simply itself (see projectedTargetEom).
  const targetPace = useMemo(
    () => (date && isTargetMoving && lastTargetValue !== null ? computePace(date, lastTargetValue, null) : null),
    [date, isTargetMoving, lastTargetValue]
  );
  const projectedTargetEom = isTargetMoving ? targetPace?.projectedEom ?? null : lastTargetValue;
  const extraSlots = pace?.daysRemaining ?? 0;

  // Resolves `hoverIndex` to a date/actual/target — a straight lookup for a
  // real data point, or (per the user's choice) a linearly interpolated
  // value along the same dotted line drawn on the chart when the hovered
  // slot falls in the projected region past the last real point.
  const hoveredInfo = useMemo<HoverInfo | null>(() => {
    if (hoverIndex === null) return null;
    if (hoverIndex <= points.length - 1) {
      const p = points[hoverIndex];
      return p ? { date: p.date, actual: p.actual, target: p.target, isProjected: false } : null;
    }
    if (!lastPoint || extraSlots <= 0) return null;
    const daysIn = hoverIndex - (points.length - 1);
    const fraction = Math.min(1, daysIn / extraSlots);
    const date = addDaysIso(lastPoint.date, daysIn);
    const actual =
      pace?.projectedEom != null && lastActualValue !== null ? lastActualValue + fraction * (pace.projectedEom - lastActualValue) : null;
    const target =
      projectedTargetEom != null && lastTargetValue !== null ? lastTargetValue + fraction * (projectedTargetEom - lastTargetValue) : null;
    return { date, actual, target, isProjected: true };
  }, [hoverIndex, points, lastPoint, extraSlots, pace, projectedTargetEom, lastActualValue, lastTargetValue]);

  const maxY = useMemo(() => {
    const values = points.flatMap((p) => [p.actual, p.target]).filter((v): v is number => v !== null);
    if (pace?.projectedEom != null) values.push(pace.projectedEom);
    if (projectedTargetEom != null) values.push(projectedTargetEom);
    return Math.max(1, ...values);
  }, [points, pace, projectedTargetEom]);

  const scaleX = useMemo(() => {
    const innerW = WIDTH - PAD.left - PAD.right;
    const totalSlots = points.length - 1 + extraSlots;
    return (i: number) => PAD.left + (totalSlots <= 0 ? 0 : (i / totalSlots) * innerW);
  }, [points.length, extraSlots]);

  /** Builds the smoothed actual curve, its filled-to-baseline twin, the
   * straight (unsmoothed) target line, and — when a forecast is available —
   * a dotted continuation of each out to the projected month-end value, for
   * a given pixel height. Shared by the compact card and the taller
   * expanded modal so they only ever differ in `height`. */
  const buildPaths = useCallback(
    (scaleY: (v: number) => number, height: number) => {
      const baseline = height - PAD.bottom;
      const actualPts: { x: number; y: number }[] = [];
      points.forEach((p, i) => {
        if (p.actual === null) return;
        actualPts.push({ x: scaleX(i), y: scaleY(p.actual) });
      });
      const path = smoothPath(actualPts);
      const areaPath = actualPts.length > 0 ? `${path} L${actualPts[actualPts.length - 1].x.toFixed(1)},${baseline} L${actualPts[0].x.toFixed(1)},${baseline} Z` : "";

      let targetPath = "";
      let started = false;
      points.forEach((p, i) => {
        if (p.target === null) return;
        const cmd = started ? "L" : "M";
        targetPath += `${cmd}${scaleX(i).toFixed(1)},${scaleY(p.target).toFixed(1)} `;
        started = true;
      });

      let projectedPath = "";
      let projectedPoint: { x: number; y: number } | null = null;
      if (extraSlots > 0 && pace?.projectedEom != null && lastActualValue !== null) {
        const from = { x: scaleX(points.length - 1), y: scaleY(lastActualValue) };
        const to = { x: scaleX(points.length - 1 + extraSlots), y: scaleY(pace.projectedEom) };
        projectedPath = `M${from.x.toFixed(1)},${from.y.toFixed(1)} L${to.x.toFixed(1)},${to.y.toFixed(1)}`;
        projectedPoint = to;
      }

      // Drawn even for a fixed target (projectedTargetEom === lastTargetValue
      // there) — a flat dotted continuation at the same height correctly
      // shows "this target isn't moving," rather than just stopping short.
      let projectedTargetPath = "";
      if (extraSlots > 0 && projectedTargetEom != null && lastTargetValue !== null) {
        const from = { x: scaleX(points.length - 1), y: scaleY(lastTargetValue) };
        const to = { x: scaleX(points.length - 1 + extraSlots), y: scaleY(projectedTargetEom) };
        projectedTargetPath = `M${from.x.toFixed(1)},${from.y.toFixed(1)} L${to.x.toFixed(1)},${to.y.toFixed(1)}`;
      }

      return { path, areaPath, targetPath: targetPath.trim(), projectedPath, projectedTargetPath, projectedPoint };
    },
    [points, scaleX, extraSlots, pace, projectedTargetEom, lastActualValue, lastTargetValue]
  );

  const scaleY = useMemo(() => {
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    return (v: number) => PAD.top + innerH - (v / maxY) * innerH;
  }, [maxY]);
  const { path, areaPath, targetPath, projectedPath, projectedTargetPath, projectedPoint } = useMemo(
    () => buildPaths(scaleY, HEIGHT),
    [scaleY, buildPaths]
  );

  // scaleY was built against HEIGHT — the modal renders taller, so it needs
  // its own scaleY sharing the same maxY/domain but a different pixel range.
  // (Previously computed against a 480px domain while the modal's SVG
  // viewBox was actually 400px tall — a pre-existing mismatch that clipped
  // the bottom of the curve; MODAL_HEIGHT keeps both in sync now.)
  const modalScaleY = useMemo(() => {
    const innerH = MODAL_HEIGHT - PAD.top - PAD.bottom;
    return (v: number) => PAD.top + innerH - (v / maxY) * innerH;
  }, [maxY]);
  const {
    path: modalPath,
    areaPath: modalAreaPath,
    targetPath: modalTargetPath,
    projectedPath: modalProjectedPath,
    projectedTargetPath: modalProjectedTargetPath,
    projectedPoint: modalProjectedPoint,
  } = useMemo(() => buildPaths(modalScaleY, MODAL_HEIGHT), [modalScaleY, buildPaths]);

  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isExpanded]);

  const legend = (
    <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-fg-subtle">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full" style={{ background: ACCENT }} />
        Actual
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full border-t border-dashed" style={{ borderColor: TARGET_COLOR }} />
        Target
      </span>
      {extraSlots > 0 && pace?.projectedEom != null ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full border-t border-dotted" style={{ borderColor: ACCENT }} />
          Projected
        </span>
      ) : null}
    </div>
  );

  // pace.projectedAchievementRatio divides the projected actual by *today's*
  // target-to-date — correct for a fixed target (projectedTargetEom equals
  // it exactly, so this reduces to the same thing), but VAS Bill's target
  // itself grows day by day (tied to GUS RO MTD, see trend.ts), so for a
  // moving target that would compare a month-end actual against a
  // still-partial target and wildly overstate achievement (confirmed live:
  // showed 155.7% against a hero card reading 78% for the same day).
  // Dividing by projectedTargetEom instead keeps both cases correct.
  const projectedRatio = pace?.projectedEom != null && projectedTargetEom ? pace.projectedEom / projectedTargetEom : null;

  // "Projected month-end: ₹5.2L (88% of target) · Need ₹11K/day for the
  // rest of the month" — plain-English readout of the same pace math the
  // dotted line draws, so the number is there even without hovering the
  // chart. Absent entirely when there's nothing to forecast from.
  const forecastRow =
    pace?.projectedEom != null ? (
      <div className="mt-2 text-[11px] text-fg-subtle">
        Projected month-end{" "}
        <span className="font-semibold tabular-nums text-fg">{formatValue(pace.projectedEom)}</span>
        {projectedRatio != null ? (
          <>
            {" "}
            (<span className="font-medium tabular-nums text-fg-muted">{formatPercent(projectedRatio)}</span> of target)
          </>
        ) : null}
        {pace.gap !== null && pace.gap > 0 && pace.requiredRatePerDay !== null && pace.daysRemaining > 0 ? (
          <>
            {" "}
            · Need <span className="font-semibold tabular-nums text-fg">{formatValue(pace.requiredRatePerDay)}/day</span> for the rest of the month
          </>
        ) : pace.gap !== null && pace.gap <= 0 ? (
          <span className="font-medium text-good"> · Target already met</span>
        ) : null}
      </div>
    ) : null;

  const metricSelect =
    metrics.length > 1 ? (
      <select
        value={metric}
        onChange={(e) => {
          setMetric(e.target.value);
          setHoverIndex(null);
        }}
        className="h-7 rounded-md border border-border-strong px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {metrics.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>
    ) : null;
  const titleSuffix = metrics.length === 1 ? ` — ${metrics[0].label}` : "";

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">MTD Trend — Actual vs Target{titleSuffix}</h2>
        <div className="flex items-center gap-1.5">
          {metricSelect}
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-strong text-fg-subtle hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title="Expand chart"
          >
            <ExpandIcon />
          </button>
        </div>
      </div>

      {legend}

      <ChartBody
        points={points}
        maxY={maxY}
        path={path}
        areaPath={areaPath}
        targetPath={targetPath}
        projectedPath={projectedPath}
        projectedTargetPath={projectedTargetPath}
        projectedPoint={projectedPoint}
        extraSlots={extraSlots}
        scaleX={scaleX}
        scaleY={scaleY}
        hoverIndex={hoverIndex}
        setHoverIndex={setHoverIndex}
        hovered={hoveredInfo}
        height={HEIGHT}
        gradientId="trend-area-card"
        formatValue={formatValue}
      />
      {forecastRow}

      {isExpanded ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4"
          onClick={() => setIsExpanded(false)}
        >
          {/* `min-h-full` centers the panel when it fits the viewport, same
           * as before — but because this wrapper (not a fixed-position flex
           * box) sits inside the scrollable backdrop, a panel taller than
           * the screen just scrolls into view naturally instead of having
           * its top and bottom clipped off with no way to reach either. */}
          <div className="flex min-h-full items-center justify-center py-8">
            <div
              className="relative w-full max-w-4xl rounded-lg bg-surface p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2 hover:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                title="Close"
              >
                <CloseIcon />
              </button>

              <div className="flex items-center justify-between pr-10">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-subtle">MTD Trend — Actual vs Target{titleSuffix}</h2>
                {metricSelect}
              </div>

              {legend}

              <ChartBody
                points={points}
                maxY={maxY}
                path={modalPath}
                areaPath={modalAreaPath}
                targetPath={modalTargetPath}
                projectedPath={modalProjectedPath}
                projectedTargetPath={modalProjectedTargetPath}
                projectedPoint={modalProjectedPoint}
                extraSlots={extraSlots}
                scaleX={scaleX}
                scaleY={modalScaleY}
                hoverIndex={hoverIndex}
                setHoverIndex={setHoverIndex}
                hovered={hoveredInfo}
                height={MODAL_HEIGHT}
                gradientId="trend-area-modal"
                formatValue={formatValue}
              />
              {forecastRow}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
