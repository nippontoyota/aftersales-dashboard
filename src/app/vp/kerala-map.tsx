"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { RegionName } from "@/lib/regions";

/**
 * Kerala. Outline simplified from the Wikimedia "India Kerala location map"
 * SVG (equirectangular, bounds N13/S8/W74.5/E78) — so branch towns, given
 * as lat/long, project straight onto it. Pin colour is the *business*
 * region, which doesn't always track geography (a Kottayam branch is in the
 * company's "North"), hence the caption. Below the map, each region's total
 * for the selected metric doubles as the region selector.
 */

const REGION_COLOR: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};
const REGION_ORDER: RegionName[] = ["North", "Central", "South"];

const VB_W = 340;
const VB_H = 600;

// lat/long → viewBox px, calibrated to the source map's projection.
const px = (lon: number) => (lon - 74.5) * 128.111 - 37.19;
const py = (lat: number) => (13 - lat) * 130.664 - 20.859;

const KERALA_PATH =
  "M25.5 6 L23.9 8.1 L20.7 7.5 L11.9 11.3 L10.8 10.6 L6 11.4 L48.7 109.7 L91.3 150.4 L95.8 147.8 L96.3 148.6 L94.2 151.8 L103.5 179 L112.4 186.1 L129.7 228 L139.5 269 L160.7 314.1 L179.8 374.5 L187.9 404.8 L192.7 441.7 L216.8 499.1 L222.3 517.1 L237.6 532.2 L274 581.1 L290.8 594 L296.3 592.3 L296 591.1 L299.1 589.5 L303.3 590.9 L302.3 588.3 L303 586.2 L301.9 585.5 L300.5 586.5 L301.3 584.4 L300.3 582.6 L303.4 581.9 L306.9 575.4 L309.8 574.4 L307.2 567 L309.5 566 L311.5 568 L314.4 566.5 L317 561.2 L312 551.7 L308.4 548.2 L307 545.3 L307.2 542.7 L303 536 L305.7 535.8 L306.5 532.5 L308.6 532.7 L308.5 531.4 L310.5 530.5 L310.9 527.9 L314.6 523.3 L314.1 519.3 L309.5 515.2 L309.1 511.9 L306.3 512.6 L306.2 508.4 L300 499.9 L302.3 496.8 L306.3 496.4 L307.8 492.8 L316.9 482.5 L317.2 477.6 L315.8 476.7 L319.2 473.3 L318.3 471.4 L319.9 466 L319.2 462.9 L321.5 460.6 L321.7 457.6 L322.6 458.7 L324 458.2 L326.9 444.9 L328.9 442.7 L332.4 442.7 L333.1 441 L332.2 438.3 L333.8 436.3 L332.4 434 L330.6 434.9 L328.1 432.8 L327.9 430.4 L326.1 428.7 L326.9 425.1 L328.1 424.6 L326.9 423.8 L324.7 427.6 L322.8 426.8 L323.3 424.6 L321.8 424 L315.1 427.5 L311.4 426.5 L307.5 422.3 L305.3 423.3 L302.4 422.3 L307.4 411.9 L307.3 408.3 L309.6 407.1 L310.9 402.1 L309.9 399.9 L312.9 398.5 L312.2 396.4 L309.8 395.1 L310.4 392 L311.7 390.8 L308.8 388.8 L309.2 384.7 L313.1 378.4 L315 378.3 L316.4 376.3 L313.8 370.6 L314.6 368 L308.1 361.4 L307.1 358.8 L308.1 357.1 L312.3 355.2 L315.5 356.4 L316.5 354.6 L316.7 348.1 L318.8 343.7 L317.7 341.7 L314.7 342 L314.9 337.5 L310.6 331.3 L311.4 326.4 L303.7 325.8 L297 330.8 L289.7 333.6 L289.6 334.6 L287.4 335.4 L288.1 337.6 L281.3 342.1 L275.3 339.9 L272.9 340.7 L269.7 339.7 L265.5 336 L266.2 333.1 L262.8 334.5 L260.6 332.2 L262.3 323.9 L259.4 320.4 L260.3 318.7 L258.4 316.7 L261.4 302.4 L260.6 300.6 L261.3 295.2 L260.7 294 L258.8 293.7 L258 289.5 L264.6 289.4 L266.8 288.3 L266.3 284.4 L264.4 283 L266.7 279.1 L268 278.7 L267.7 276.3 L269.8 270.7 L268.5 266.5 L262.4 265.1 L262.9 262.4 L259.7 258.5 L254.3 256.1 L248.8 255.7 L238 250.2 L242.3 239.9 L245.3 236.5 L252.1 237.2 L255.3 236.5 L256.3 235.2 L256.1 233.9 L253.3 236.2 L249.4 234.1 L249.2 232.1 L250.7 230.6 L249 228.4 L249.6 224.9 L247 224.1 L245.5 222 L244.5 223.2 L243 220.6 L243.2 218.9 L247.1 216.5 L247.8 213.3 L244.1 210.3 L235 216 L231.8 214.2 L222.8 215.5 L217.6 214 L215.1 214.3 L214.7 216 L213.1 216.8 L211 215 L212.2 209.8 L222.1 204.4 L224.8 196.9 L224.6 193.1 L217.8 195.3 L219.5 193.1 L218.8 191.6 L208 186.9 L207.5 184 L205 184.6 L197.8 180.7 L196.1 182.4 L194.3 180.6 L192.7 180.6 L191.4 178.3 L186.6 180.4 L187.1 175.6 L183.8 166.8 L189.6 163.2 L192.1 164.7 L193 166.8 L196.9 163.8 L197.9 165.1 L202 163.2 L203.5 159.3 L209.3 159.1 L210.3 158.1 L210.6 156.9 L209.2 154.4 L207.3 153.5 L205.8 149.1 L208.6 146.9 L206.9 144.7 L207.2 142.3 L199.1 145.1 L194.6 143.4 L193.5 139.5 L189.9 135.7 L185.7 136.7 L183.4 135.3 L181.2 127.9 L179.8 126.7 L174.4 127.1 L169.5 130.1 L168.7 113.9 L163.9 115.2 L158.7 118.7 L155.6 118.8 L154.6 120 L138.6 117.5 L132.6 112.5 L132.7 109.5 L129.1 105.6 L128.8 100.3 L124.3 99.8 L118.7 101.7 L116.5 96 L114.6 95.7 L112 97.3 L110 95.3 L108.2 90.6 L106.2 89.7 L102.7 90.3 L98.8 88.1 L95.3 84.4 L95.8 82.5 L88.1 71.4 L86.7 70.7 L79.8 71.6 L81.4 70.1 L79.9 68.6 L79.4 65.8 L80.7 62.3 L75.5 59.6 L74 57.6 L73.7 51.4 L77.9 51.8 L80.9 50 L80.1 45.6 L76 45.8 L74.5 46.8 L74.5 48.8 L70.2 50.4 L69.9 46.5 L66.1 45.2 L65.7 42.9 L62.9 42.2 L61.6 38.9 L62.3 36.4 L65.2 35 L67.4 35.6 L68.8 33.6 L64.2 32.2 L62.3 30.2 L57.2 36.6 L55.7 36.7 L52.9 34.1 L53.7 32.4 L52.2 30.7 L52.5 27.8 L50.3 27.4 L46.9 28.7 L45.3 27.3 L47.3 23 L46 20.9 L41.9 21.1 L37.6 18.2 L37.4 22 L35.4 23.3 L32.7 23 L32.2 19.9 L33.8 19.7 L33.1 16.1 L31.3 15.4 L28 16.8 L27.1 16.1 L27.9 14.7 L24.6 13.5 L27.7 9.7 L27.2 6.7 Z";

// branch towns [lon, lat]
const TOWN: Record<string, [number, number]> = {
  thrissur: [76.214, 10.527], chalakudy: [76.334, 10.307], irinjalakuda: [76.21, 10.343],
  kochi: [76.283, 9.981], muvattupuzha: [76.578, 9.989], kottayam: [76.522, 9.591],
  pala: [76.684, 9.712], thiruvalla: [76.565, 9.383], pathanamthitta: [76.787, 9.264],
  kayamkulam: [76.502, 9.176], kollam: [76.61, 8.893], trivandrum: [76.949, 8.524],
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
    const x0 = px(lon), y0 = py(lat);
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
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-[470px] w-auto max-w-full" role="img" aria-label={`Kerala, branch locations sized by ${metricLabel}`}>
          <defs>
            <linearGradient id="keralaFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--color-surface-2)" />
              <stop offset="1" stopColor="var(--color-surface-3)" />
            </linearGradient>
            <filter id="pinShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.1" floodOpacity="0.35" />
            </filter>
          </defs>

          <path d={KERALA_PATH} fill="url(#keralaFill)" stroke="var(--color-border-strong)" strokeWidth="1.1" strokeLinejoin="round" />

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
                strokeWidth="1.2"
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
