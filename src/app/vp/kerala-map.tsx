"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { RegionName } from "@/lib/regions";

/**
 * Kerala, drawn from a simplified real outline (equirectangular projection
 * of ~50 boundary points), with every branch as a pin at its town, sized by
 * the selected metric. Pin colour is the *business* region — which doesn't
 * always track geography (a Kottayam branch is in the company's "North"),
 * so it's captioned. Below the map, each region's total for the same metric
 * doubles as the region selector.
 */

const REGION_COLOR: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};
const REGION_ORDER: RegionName[] = ["North", "Central", "South"];

// --- projection ---------------------------------------------------------
const LON0 = 74.82;
const LAT_TOP = 12.85;
const S = 70; // px per degree (lat≈lon in km at 10°N, so a single scale)
const PAD = 10;
const px = (lon: number) => PAD + (lon - LON0) * S;
const py = (lat: number) => PAD + (LAT_TOP - lat) * S;
const VB_W = Math.ceil(PAD * 2 + (77.6 - LON0) * S);
const VB_H = Math.ceil(PAD * 2 + (LAT_TOP - 8.1) * S);

// Kerala boundary, clockwise from the north tip: down the west (coast),
// then up the east (Western Ghats). [lon, lat].
const KERALA: [number, number][] = [
  [74.9, 12.79], [74.99, 12.47], [75.12, 12.16], [75.29, 11.94], [75.46, 11.74],
  [75.61, 11.57], [75.74, 11.41], [75.8, 11.23], [75.85, 11.06], [75.94, 10.83],
  [76.01, 10.53], [76.04, 10.26], [76.02, 10.03], [76.19, 9.91], [76.28, 9.94],
  [76.31, 9.7], [76.35, 9.46], [76.42, 9.26], [76.5, 9.04], [76.58, 8.86],
  [76.7, 8.7], [76.85, 8.53], [77.0, 8.4], [77.12, 8.28], [77.2, 8.2],
  [77.29, 8.34], [77.25, 8.62], [77.3, 8.96], [77.22, 9.26], [77.3, 9.5],
  [77.44, 9.66], [77.31, 9.92], [77.2, 10.15], [77.04, 10.32], [77.11, 10.52],
  [76.93, 10.72], [76.78, 10.92], [76.6, 11.1], [76.5, 11.29], [76.54, 11.46],
  [76.4, 11.6], [76.18, 11.72], [76.02, 11.91], [75.82, 12.12], [75.56, 12.34],
  [75.26, 12.57], [75.02, 12.71],
];

/** Closed Catmull-Rom → cubic-bezier path for a smooth coastline. */
function smoothClosed(pts: [number, number][]): string {
  const n = pts.length;
  const p = (i: number) => pts[((i % n) + n) % n];
  let d = `M ${px(p(0)[0]).toFixed(1)} ${py(p(0)[1]).toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const a = p(i - 1), b = p(i), c = p(i + 1), e = p(i + 2);
    const c1x = px(b[0]) + (px(c[0]) - px(a[0])) / 6;
    const c1y = py(b[1]) + (py(c[1]) - py(a[1])) / 6;
    const c2x = px(c[0]) - (px(e[0]) - px(b[0])) / 6;
    const c2y = py(c[1]) - (py(e[1]) - py(b[1])) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${px(c[0]).toFixed(1)} ${py(c[1]).toFixed(1)}`;
  }
  return `${d} Z`;
}
const KERALA_PATH = smoothClosed(KERALA);

// --- branch towns ------------------------------------------------------
const TOWN: Record<string, [number, number]> = {
  thrissur: [76.25, 10.52], chalakudy: [76.33, 10.31], irinjalakuda: [76.24, 10.34],
  kochi: [76.32, 10.0], muvattupuzha: [76.58, 9.99], kottayam: [76.53, 9.59],
  pala: [76.68, 9.72], thiruvalla: [76.57, 9.38], pathanamthitta: [76.79, 9.26],
  kayamkulam: [76.5, 9.18], kollam: [76.63, 8.89], trivandrum: [76.95, 8.52],
};
const BRANCH_TOWN: Record<string, keyof typeof TOWN> = {
  TI01A: "thrissur", TI01B: "thrissur", TI01C: "chalakudy", IR01A: "irinjalakuda",
  CO01A: "kochi", CO01B: "kochi", CO01E: "kochi", MV01A: "muvattupuzha",
  KT01A: "kottayam", KT01B: "pala", TL01A: "thiruvalla", PH01A: "pathanamthitta",
  KY01A: "kayamkulam", KL01A: "kollam", KL01B: "kollam",
  TR01A: "trivandrum", TR01B: "trivandrum", TR01C: "trivandrum",
};

export type BranchPin = { branch: string; region: RegionName; value: number | null; display: string };
export type RegionSummary = { region: RegionName; display: string; share: number | null; branches: number };

export function KeralaMap({
  pins,
  regionSummaries,
  metricLabel,
  metricControl,
  date,
  selectedRegion,
}: {
  pins: BranchPin[];
  regionSummaries: RegionSummary[];
  metricLabel: string;
  metricControl?: ReactNode;
  date: string;
  selectedRegion: RegionName | null;
}) {
  const router = useRouter();
  const go = (href: string) => router.push(href);
  const byRegion = new Map(regionSummaries.map((s) => [s.region, s]));

  const max = Math.max(1, ...pins.map((p) => p.value ?? 0));
  const radius = (v: number | null) => (v == null || v <= 0 ? 2.8 : 3.5 + Math.sqrt(Math.max(0, v) / max) * 9);

  // Fan co-located branches out horizontally around their town.
  const byTown = new Map<string, BranchPin[]>();
  for (const p of pins) {
    const t = BRANCH_TOWN[p.branch];
    if (!t) continue;
    const list = byTown.get(t);
    if (list) list.push(p);
    else byTown.set(t, [p]);
  }
  const placed = [...byTown.entries()].flatMap(([town, list]) => {
    const [lon, lat] = TOWN[town];
    const cx0 = px(lon), cy0 = py(lat);
    return list.map((p, i) => ({
      pin: p,
      cx: cx0 + (i - (list.length - 1) / 2) * 11,
      cy: cy0 + (i % 2 === 0 ? 0 : 4),
    }));
  });
  placed.sort((a, b) => radius(b.pin.value) - radius(a.pin.value));

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-faint">Regions</span>
        {metricControl}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-fg-faint">bubble size · {metricLabel}</div>

      <div className="mt-2 flex justify-center">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="h-[440px] w-auto max-w-full"
          role="img"
          aria-label={`Kerala, branch locations sized by ${metricLabel}`}
        >
          <defs>
            <linearGradient id="keralaFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--color-surface-2)" />
              <stop offset="1" stopColor="var(--color-surface-3)" />
            </linearGradient>
            <filter id="pinShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodOpacity="0.35" />
            </filter>
          </defs>

          <path
            d={KERALA_PATH}
            fill="url(#keralaFill)"
            stroke="var(--color-border-strong)"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />

          {placed.map(({ pin, cx, cy }) => {
            const dim = selectedRegion !== null && pin.region !== selectedRegion;
            return (
              <circle
                key={pin.branch}
                cx={cx}
                cy={cy}
                r={radius(pin.value)}
                fill={REGION_COLOR[pin.region]}
                fillOpacity={dim ? 0.16 : 0.92}
                stroke="var(--color-surface)"
                strokeWidth="1.4"
                filter={dim ? undefined : "url(#pinShadow)"}
                className="cursor-pointer transition-[fill-opacity]"
                onClick={() => go(`/vp/branches?date=${date}&branch=${pin.branch}`)}
              >
                <title>
                  {pin.branch} · {pin.region} · {pin.display}
                </title>
              </circle>
            );
          })}
        </svg>
      </div>

      <div className="mt-1 space-y-1.5">
        {REGION_ORDER.map((r) => {
          const s = byRegion.get(r);
          const active = selectedRegion === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => go(active ? `/vp/regions?date=${date}` : `/vp/regions?date=${date}&region=${r}`)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                active ? "border-accent bg-accent-soft/50" : "border-border hover:bg-surface-2/60"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: REGION_COLOR[r] }} />
                <span className="text-[13px] font-semibold text-fg">{r}</span>
                <span className="text-[10px] text-fg-faint">· {s?.branches ?? 0}</span>
                <span className="ml-auto text-[13px] font-semibold tabular-nums text-fg">{s?.display ?? "—"}</span>
              </div>
              {s && s.share != null ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full" style={{ width: `${Math.round(s.share * 100)}%`, background: REGION_COLOR[r] }} />
                  </span>
                  <span className="w-9 text-right text-[10px] text-fg-faint">{Math.round(s.share * 100)}%</span>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-center text-[10px] text-fg-faint">
        Pins at branch towns · colour = business region · click a pin for that branch
      </p>
    </div>
  );
}
