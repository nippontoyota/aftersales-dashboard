"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { RegionName } from "@/lib/regions";

/**
 * Kerala — a long, thin NW→SE ribbon: smooth Arabian-Sea coast on the west,
 * the jagged Western Ghats on the east that bulge out around Wayanad,
 * Palakkad and Idukki, tapering to points north (Kasaragod) and south
 * (Parassala). Branch pins sit at their town, sized by the selected metric
 * and coloured by *business* region (which doesn't always track geography —
 * a Kottayam branch is in the company's "North" — hence the caption). Below
 * the map, each region's total for that metric doubles as the selector.
 */

const REGION_COLOR: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};
const REGION_ORDER: RegionName[] = ["North", "Central", "South"];

const VIEWBOX = "62 8 134 612";

// Perimeter, clockwise from the northern tip: down the Western Ghats (east),
// round the southern point, up the coast (west).
const KERALA_POLY: [number, number][] = [
  [86, 22], [96, 38], [106, 58], [118, 82], [130, 105], [138, 128], [150, 150], [164, 165],
  [158, 188], [168, 210], [162, 235], [170, 258], [182, 278], [172, 300], [178, 325], [170, 350],
  [176, 375], [184, 400], [178, 420], [166, 445], [172, 470], [162, 505], [160, 550], [148, 592],
  [140, 600], [128, 540], [112, 470], [104, 430], [92, 360], [86, 300], [78, 250], [74, 175],
  [78, 118], [80, 70], [82, 40],
];

/** Closed Catmull-Rom → cubic-bezier for a natural coastline. */
function smoothClosed(pts: [number, number][]): string {
  const n = pts.length;
  const p = (i: number) => pts[((i % n) + n) % n];
  const f = (v: number) => v.toFixed(1);
  let d = `M ${f(p(0)[0])} ${f(p(0)[1])}`;
  for (let i = 0; i < n; i++) {
    const a = p(i - 1), b = p(i), c = p(i + 1), e = p(i + 2);
    d +=
      ` C ${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)},` +
      ` ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)},` +
      ` ${f(c[0])} ${f(c[1])}`;
  }
  return `${d} Z`;
}
const KERALA_PATH = smoothClosed(KERALA_POLY);

// --- branch towns (same coordinate space) ----------------------------
const TOWN: Record<string, [number, number]> = {
  thrissur: [108, 278], chalakudy: [104, 298], irinjalakuda: [96, 302],
  kochi: [92, 308], muvattupuzha: [128, 300], kottayam: [114, 350],
  pala: [132, 340], thiruvalla: [118, 378], pathanamthitta: [134, 380],
  kayamkulam: [104, 402], kollam: [110, 432], trivandrum: [130, 528],
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
  const radius = (v: number | null) => (v == null || v <= 0 ? 3 : 3.5 + Math.sqrt(Math.max(0, v) / max) * 9);

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
    const [x0, y0] = TOWN[town];
    return list.map((p, i) => ({
      pin: p,
      cx: x0 + (i - (list.length - 1) / 2) * 10,
      cy: y0 + (i % 2 === 0 ? 0 : 4),
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
        <svg viewBox={VIEWBOX} className="h-[470px] w-auto max-w-full" role="img" aria-label={`Kerala, branch locations sized by ${metricLabel}`}>
          <defs>
            <linearGradient id="keralaFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--color-surface-2)" />
              <stop offset="1" stopColor="var(--color-surface-3)" />
            </linearGradient>
            <filter id="pinShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.1" floodOpacity="0.35" />
            </filter>
          </defs>

          <path d={KERALA_PATH} fill="url(#keralaFill)" stroke="var(--color-border-strong)" strokeWidth="1.3" strokeLinejoin="round" />

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
                strokeWidth="1.3"
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
