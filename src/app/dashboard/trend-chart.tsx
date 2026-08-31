"use client";

import { useEffect, useMemo, useState } from "react";
import type { TrendPoint } from "@/lib/trend";
import { formatNumber } from "@/lib/format";

export type TrendMetricConfig = { key: string; label: string };

/** BPU/Offtake/Parts Retail/PM+OC moved to their own trend chart on the TKM
 * Targets page (2026-08-31) — this default is what's left on the main
 * dashboard's chart. */
const DEFAULT_METRICS: TrendMetricConfig[] = [{ key: "vas", label: "VAS Bill (Rs)" }];

// Stable reference (not `[]` inline at the call site) so a missing metric
// key doesn't hand useMemo a new array identity on every render.
const EMPTY_POINTS: TrendPoint[] = [];

const ACCENT = "#dc2626"; // Toyota-red accent, matches the sidebar mark
const TARGET_COLOR = "#94a3b8"; // slate-400, recessive — target is reference, not the story

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 12 };

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

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
  targetPath,
  scaleX,
  scaleY,
  hoverIndex,
  setHoverIndex,
  height,
}: {
  points: TrendPoint[];
  maxY: number;
  path: string;
  targetPath: string;
  scaleX: (i: number) => number;
  scaleY: (v: number) => number;
  hoverIndex: number | null;
  setHoverIndex: (i: number | null) => void;
  /** Taller in the expanded modal — same viewBox width, more vertical room to read. */
  height: number;
}) {
  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  if (points.length === 0) {
    return <div className="mt-4 flex h-[180px] items-center justify-center text-xs text-slate-400">No uploads yet this month.</div>;
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
            const idx = Math.round(((relX - PAD.left) / innerW) * (points.length - 1));
            setHoverIndex(Math.min(points.length - 1, Math.max(0, idx)));
          }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {gridLines.map((g) => (
            <line
              key={g}
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={PAD.top + g * (height - PAD.top - PAD.bottom)}
              y2={PAD.top + g * (height - PAD.top - PAD.bottom)}
              stroke="#f1f5f9"
              strokeWidth={1}
            />
          ))}

          {targetPath ? <path d={targetPath} fill="none" stroke={TARGET_COLOR} strokeWidth={2} strokeDasharray="4 3" strokeLinecap="round" /> : null}
          {path ? <path d={path} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}

          {hoverIndex !== null ? (
            <line x1={scaleX(hoverIndex)} x2={scaleX(hoverIndex)} y1={PAD.top} y2={height - PAD.bottom} stroke="#cbd5e1" strokeWidth={1} />
          ) : null}
          {hovered?.actual !== null && hovered?.actual !== undefined && hoverIndex !== null ? (
            <circle cx={scaleX(hoverIndex)} cy={scaleY(hovered.actual)} r={3.5} fill={ACCENT} stroke="white" strokeWidth={1.5} />
          ) : null}

          {points.length > 1 ? (
            <>
              <text x={PAD.left} y={height - 6} className="fill-slate-400" fontSize={10}>
                {formatShortDate(points[0].date)}
              </text>
              <text x={WIDTH - PAD.right} y={height - 6} textAnchor="end" className="fill-slate-400" fontSize={10}>
                {formatShortDate(points[points.length - 1].date)}
              </text>
            </>
          ) : null}
        </svg>

        {hovered ? (
          <div
            className="pointer-events-none absolute top-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] shadow-md"
            style={{
              left: `${Math.min(78, Math.max(2, (scaleX(hoverIndex!) / WIDTH) * 100))}%`,
            }}
          >
            <div className="font-medium text-slate-700">{formatShortDate(hovered.date)}</div>
            <div className="text-slate-500">
              Actual <span className="font-semibold tabular-nums text-slate-900">{formatNumber(hovered.actual)}</span>
            </div>
            <div className="text-slate-500">
              Target <span className="font-semibold tabular-nums text-slate-900">{formatNumber(hovered.target)}</span>
            </div>
          </div>
        ) : null}
      </div>
      <p className="mt-1 text-[10px] text-slate-400">Max on chart: {formatNumber(maxY)}</p>
    </>
  );
}

export function TrendChart({
  seriesByMetric,
  metrics = DEFAULT_METRICS,
}: {
  seriesByMetric: Record<string, TrendPoint[]>;
  /** Defaults to the main dashboard's own set (VAS only); the TKM Targets page passes its BPU/Offtake/Parts Retail/PM+OC metrics and series instead. */
  metrics?: TrendMetricConfig[];
}) {
  const [metric, setMetric] = useState<string>(metrics[0]?.key ?? "");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const points = seriesByMetric[metric] ?? EMPTY_POINTS;

  const { path, targetPath, scaleX, scaleY, maxY } = useMemo(() => {
    const values = points.flatMap((p) => [p.actual, p.target]).filter((v): v is number => v !== null);
    const maxY = Math.max(1, ...values);
    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;

    const scaleX = (i: number) => PAD.left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW);
    const scaleY = (v: number) => PAD.top + innerH - (v / maxY) * innerH;

    const buildPath = (key: "actual" | "target") => {
      let d = "";
      let started = false;
      points.forEach((p, i) => {
        const v = p[key];
        if (v === null) return;
        const cmd = started ? "L" : "M";
        d += `${cmd}${scaleX(i).toFixed(1)},${scaleY(v).toFixed(1)} `;
        started = true;
      });
      return d.trim();
    };

    return { path: buildPath("actual"), targetPath: buildPath("target"), scaleX, scaleY, maxY };
  }, [points]);

  // scaleY was built against HEIGHT — the modal renders taller, so it needs
  // its own scaleY sharing the same maxY/domain but a different pixel range.
  const modalScaleY = useMemo(() => {
    const innerH = 480 - PAD.top - PAD.bottom;
    return (v: number) => PAD.top + innerH - (v / maxY) * innerH;
  }, [maxY]);
  const modalPath = useMemo(() => {
    let d = "";
    let started = false;
    const innerW = WIDTH - PAD.left - PAD.right;
    const sx = (i: number) => PAD.left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW);
    points.forEach((p, i) => {
      if (p.actual === null) return;
      const cmd = started ? "L" : "M";
      d += `${cmd}${sx(i).toFixed(1)},${modalScaleY(p.actual).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  }, [points, modalScaleY]);
  const modalTargetPath = useMemo(() => {
    let d = "";
    let started = false;
    const innerW = WIDTH - PAD.left - PAD.right;
    const sx = (i: number) => PAD.left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW);
    points.forEach((p, i) => {
      if (p.target === null) return;
      const cmd = started ? "L" : "M";
      d += `${cmd}${sx(i).toFixed(1)},${modalScaleY(p.target).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  }, [points, modalScaleY]);

  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isExpanded]);

  const legend = (
    <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full" style={{ background: ACCENT }} />
        Actual
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full border-t border-dashed" style={{ borderColor: TARGET_COLOR }} />
        Target
      </span>
    </div>
  );

  const metricSelect =
    metrics.length > 1 ? (
      <select
        value={metric}
        onChange={(e) => {
          setMetric(e.target.value);
          setHoverIndex(null);
        }}
        className="h-7 rounded border border-slate-300 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
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
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">MTD Trend — Actual vs Target{titleSuffix}</h2>
        <div className="flex items-center gap-1.5">
          {metricSelect}
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-300 text-slate-500 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
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
        targetPath={targetPath}
        scaleX={scaleX}
        scaleY={scaleY}
        hoverIndex={hoverIndex}
        setHoverIndex={setHoverIndex}
        height={HEIGHT}
      />

      {isExpanded ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-4"
          onClick={() => setIsExpanded(false)}
        >
          {/* `min-h-full` centers the panel when it fits the viewport, same
           * as before — but because this wrapper (not a fixed-position flex
           * box) sits inside the scrollable backdrop, a panel taller than
           * the screen just scrolls into view naturally instead of having
           * its top and bottom clipped off with no way to reach either. */}
          <div className="flex min-h-full items-center justify-center py-8">
            <div
              className="relative w-full max-w-4xl rounded-lg bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                title="Close"
              >
                <CloseIcon />
              </button>

              <div className="flex items-center justify-between pr-10">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">MTD Trend — Actual vs Target{titleSuffix}</h2>
                {metricSelect}
              </div>

              {legend}

              <ChartBody
                points={points}
                maxY={maxY}
                path={modalPath}
                targetPath={modalTargetPath}
                scaleX={scaleX}
                scaleY={modalScaleY}
                hoverIndex={hoverIndex}
                setHoverIndex={setHoverIndex}
                height={400}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
