"use client";

import { useRouter } from "next/navigation";
import type { RegionName } from "@/lib/regions";

/**
 * Kerala, with every branch as a pin at its town and sized by the selected
 * metric. Pin colour is the *business* region (North / Central / South) —
 * which doesn't always track geography (a Kottayam branch is in the
 * company's "North"), so it's captioned. Click a pin to open that branch;
 * click a region pill to drill into it.
 */

const REGION_COLOR: Record<RegionName, string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

// Hand-placed on the viewBox below — town positions, nudged apart where a
// town has more than one branch.
const BRANCH_XY: Record<string, [number, number]> = {
  TI01A: [104, 300], TI01B: [116, 307], TI01C: [100, 328], IR01A: [92, 337],
  CO01A: [92, 378], CO01B: [104, 386], CO01E: [114, 377], MV01A: [132, 370],
  KT01A: [120, 428], KT01B: [136, 418], TL01A: [118, 456], PH01A: [136, 462],
  KY01A: [106, 474], KL01A: [104, 508], KL01B: [116, 516],
  TR01A: [120, 566], TR01B: [132, 560], TR01C: [125, 578],
};

// A recognisable, not surveyed, Kerala silhouette — long coastal strip,
// Palakkad-gap bulge on the east about a third down, tapered at both ends.
const KERALA_PATH =
  "M112 16 C100 26 92 44 88 66 C82 96 78 128 76 160 C74 196 72 232 74 266 " +
  "C76 300 82 332 90 362 C97 388 104 414 112 442 C118 466 123 490 130 516 " +
  "C134 534 137 556 140 582 C145 566 149 546 153 526 C159 498 164 468 166 436 " +
  "C168 402 166 366 169 334 C172 304 181 278 187 250 C191 230 189 208 181 188 " +
  "C172 164 163 142 159 118 C154 90 149 58 139 36 C133 24 122 18 112 16 Z";

export type BranchPin = {
  branch: string;
  region: RegionName;
  value: number | null;
  display: string;
};

export function KeralaMap({
  pins,
  metricLabel,
  date,
  selectedRegion,
}: {
  pins: BranchPin[];
  metricLabel: string;
  date: string;
  selectedRegion: RegionName | null;
}) {
  const router = useRouter();
  const max = Math.max(1, ...pins.map((p) => p.value ?? 0));
  const radius = (v: number | null) => (v == null || v <= 0 ? 3.5 : 4 + Math.sqrt(v / max) * 13);

  const go = (href: string) => router.push(href);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap gap-1.5">
        <RegionPill label="All Kerala" active={selectedRegion === null} onClick={() => go(`/vp/regions?date=${date}`)} />
        {(["North", "Central", "South"] as RegionName[]).map((r) => (
          <RegionPill
            key={r}
            label={r}
            color={REGION_COLOR[r]}
            active={selectedRegion === r}
            onClick={() => go(`/vp/regions?date=${date}&region=${r}`)}
          />
        ))}
      </div>
      <div className="mt-2 text-center text-[10px] uppercase tracking-[0.08em] text-fg-faint">bubble size · {metricLabel}</div>

      <div className="mt-1 flex justify-center">
        <svg viewBox="0 0 220 620" className="h-[520px] w-auto" role="img" aria-label={`Kerala map, branches sized by ${metricLabel}`}>
          <defs>
            <filter id="pinShadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodOpacity="0.35" />
            </filter>
          </defs>
          <path d={KERALA_PATH} fill="var(--color-surface-2)" stroke="var(--color-border-strong)" strokeWidth="1.5" />
          {pins
            .slice()
            .sort((a, b) => radius(b.value) - radius(a.value))
            .map((p) => {
              const xy = BRANCH_XY[p.branch];
              if (!xy) return null;
              const dim = selectedRegion !== null && p.region !== selectedRegion;
              return (
                <circle
                  key={p.branch}
                  cx={xy[0]}
                  cy={xy[1]}
                  r={radius(p.value)}
                  fill={REGION_COLOR[p.region]}
                  fillOpacity={dim ? 0.18 : 0.9}
                  stroke="var(--color-surface)"
                  strokeWidth="1.5"
                  filter={dim ? undefined : "url(#pinShadow)"}
                  className="cursor-pointer transition-[fill-opacity]"
                  onClick={() => go(`/vp/branches?date=${date}&branch=${p.branch}`)}
                >
                  <title>
                    {p.branch} · {p.region} · {p.display}
                  </title>
                </circle>
              );
            })}
        </svg>
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
        {(["North", "Central", "South"] as RegionName[]).map((r) => (
          <span key={r} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: REGION_COLOR[r] }} />
            {r}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-center text-[10px] text-fg-faint">Pins at branch towns · click a pin for that branch</p>
    </div>
  );
}

function RegionPill({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-muted hover:bg-surface-2"
      }`}
    >
      {color ? <span className="h-2 w-2 rounded-full" style={{ background: color }} /> : null}
      {label}
    </button>
  );
}
