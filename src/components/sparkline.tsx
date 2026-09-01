"use client";

import { useId } from "react";

const WIDTH = 100;
const HEIGHT = 28;
const PAD_Y = 3; // keeps the end-dot's stroke ring from clipping at the top/bottom edge

/** A bare trend line, no axes/labels/tooltip — for embedding inside a KPI card where the big trend chart elsewhere already carries the full detail. Null points are skipped, not zeroed, so a metric that hasn't been uploaded every day doesn't show a misleading dip to zero.
 * Carries the same soft gradient fill + anchored end-dot as the big trend chart (2026-09-01, at the user's request) — at this size a bare 1.5px line read as an afterthought; the fill gives it something to sit on. */
export function Sparkline({ values, color = "#dc2626" }: { values: (number | null)[]; color?: string }) {
  // useId (not a module-level counter or Math.random) — many sparklines
  // render on the same page at once and each gradient id must be unique,
  // but generating it during render can't mutate outside state or produce a
  // value that could differ between server and client. Called before the
  // early return below — Hooks can't be conditional.
  const gradientId = `sparkline-area-${useId()}`;

  const points = values.filter((v): v is number => v !== null);
  if (points.length < 2) return null;

  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const innerH = HEIGHT - PAD_Y * 2;

  const pts: { x: number; y: number }[] = [];
  let i = 0;
  for (const v of values) {
    const x = values.length <= 1 ? 0 : (i / (values.length - 1)) * WIDTH;
    if (v !== null) {
      const y = PAD_Y + innerH - ((v - min) / range) * innerH;
      pts.push({ x, y });
    }
    i += 1;
  }

  const path = pts.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const areaPath = `${path} L${last.x.toFixed(1)},${HEIGHT} L${pts[0].x.toFixed(1)},${HEIGHT} Z`;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-7 w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.24} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={2} fill={color} stroke="white" strokeWidth={1} />
    </svg>
  );
}
