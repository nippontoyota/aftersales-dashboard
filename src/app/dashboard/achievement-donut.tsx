"use client";

import { useMemo, useState } from "react";
import type { BranchReport, OnlineStoreBreakdown } from "@/lib/report";
import { achievementRatio, achievementTone, hasActualWithoutTarget, type AchievementTone } from "@/lib/aggregate";
import { formatCompact, formatPercent } from "@/lib/format";

export type DonutMetricConfig = { key: string; label: string; actual: keyof BranchReport; target: keyof BranchReport };

/** BPU/Offtake/Parts Retail/PM+OC moved to their own donut on the TKM
 * Targets page (2026-08-31) — this default is what's left on the main
 * dashboard's donut. */
const DEFAULT_METRICS: DonutMetricConfig[] = [{ key: "vas", label: "VAS", actual: "vasAchievementForTheMonth", target: "vasBillTarget" }];

const TONE_HEX: Record<AchievementTone, string> = {
  good: "#10b981",
  warn: "#f59e0b",
  critical: "#ef4444",
  neutral: "#e2e8f0",
};

const TONE_LABEL: Record<AchievementTone, string> = {
  good: "Achieved (≥100%)",
  warn: "Near target (90–99%)",
  critical: "Below target (<90%)",
  neutral: "No target set",
};

const ORDER: AchievementTone[] = ["good", "warn", "critical", "neutral"];

const SIZE = 148;
const STROKE = 22;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;
const GAP = 4; // px of arc-length breathing room between ring segments

type ToneBranch = { branch: string; onlineStoreBreakdown?: OnlineStoreBreakdown };

function ExpandIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
      <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One "└ CO01A (physical): 98.4%" / "└ CO01C (online): 1,287" line — same
 * split-back-apart math as the heatmap, Alerts panel, Branch Performance
 * bars, and Region Scorecard. */
function BreakdownLine({ label, actual, target }: { label: string; actual: number | null; target: number | null }) {
  const ratio = achievementRatio(actual, target);
  const activityOnly = hasActualWithoutTarget(actual, target);
  const display = ratio !== null ? formatPercent(ratio) : activityOnly ? formatCompact(actual) : "—";
  return (
    <div className="pl-3 text-[10px] text-slate-400">
      └ {label} <span className={`font-medium ${activityOnly ? "text-sky-700" : "text-slate-500"}`}>{display}</span>
    </div>
  );
}

export function AchievementDonut({ branches, metrics = DEFAULT_METRICS }: { branches: BranchReport[]; metrics?: DonutMetricConfig[] }) {
  const [metric, setMetric] = useState<string>(metrics[0]?.key ?? "");
  const [openTone, setOpenTone] = useState<AchievementTone | null>(null);
  const [openBreakdownBranch, setOpenBreakdownBranch] = useState<string | null>(null);
  const config = metrics.find((m) => m.key === metric) ?? metrics[0];

  const { counts, branchesByTone, overallPct } = useMemo(() => {
    const counts: Record<AchievementTone, number> = { good: 0, warn: 0, critical: 0, neutral: 0 };
    const branchesByTone: Record<AchievementTone, ToneBranch[]> = { good: [], warn: [], critical: [], neutral: [] };
    let ratioSum = 0;
    let ratioCount = 0;
    for (const b of branches) {
      const actual = b[config.actual] as number | null;
      const target = b[config.target] as number | null;
      const ratio = achievementRatio(actual, target);
      const tone = achievementTone(ratio);
      counts[tone] += 1;
      branchesByTone[tone].push({ branch: b.branch, onlineStoreBreakdown: config.key === "offtake" ? b.onlineStoreBreakdown : undefined });
      if (ratio !== null) {
        ratioSum += ratio;
        ratioCount += 1;
      }
    }
    return { counts, branchesByTone, overallPct: ratioCount > 0 ? (ratioSum / ratioCount) * 100 : null };
  }, [branches, config]);

  const total = branches.length || 1;
  const segments = ORDER.filter((tone) => counts[tone] > 0).reduce<{ tone: AchievementTone; dash: number; offset: number }[]>(
    (acc, tone) => {
      const dash = (counts[tone] / total) * CIRCUMFERENCE;
      const offset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0;
      return [...acc, { tone, dash, offset }];
    },
    []
  );

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Target Achievement Breakdown{metrics.length === 1 ? ` — ${metrics[0].label}` : ""}
        </h2>
        {metrics.length > 1 ? (
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="h-7 rounded border border-slate-300 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-4">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="shrink-0 -rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />
          {segments.map((seg) => {
            // A small rounded-cap gap between segments (2026-09-01, at the
            // user's request) — trims a few px off each segment's visible
            // length and re-centers it in its true slot, rather than just
            // switching to round caps directly, which would overlap the
            // *next* segment instead of leaving a real gap.
            const visibleDash = Math.max(0, seg.dash - GAP);
            const visibleOffset = seg.offset + GAP / 2;
            return (
              <circle
                key={seg.tone}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={TONE_HEX[seg.tone]}
                strokeWidth={STROKE}
                strokeDasharray={`${visibleDash} ${CIRCUMFERENCE - visibleDash}`}
                strokeDashoffset={-visibleOffset}
                strokeLinecap="round"
              >
                <title>{`${TONE_LABEL[seg.tone]}: ${branchesByTone[seg.tone].map((b) => b.branch).join(", ")}`}</title>
              </circle>
            );
          })}
          <g transform={`rotate(90 ${SIZE / 2} ${SIZE / 2})`}>
            <text x={SIZE / 2} y={SIZE / 2 - 4} textAnchor="middle" fontSize={20} fontWeight={700} className="fill-slate-900">
              {overallPct === null ? "—" : `${Math.round(overallPct)}%`}
            </text>
            <text x={SIZE / 2} y={SIZE / 2 + 14} textAnchor="middle" fontSize={9} className="fill-slate-400">
              Overall
            </text>
            <title>{`Average ${config.label} achievement across branches with a target set`}</title>
          </g>
        </svg>

        <div className="min-w-0 flex-1 space-y-1.5">
          {ORDER.filter((tone) => counts[tone] > 0).map((tone) => {
            const isOpen = openTone === tone;
            return (
              <div key={tone}>
                <button
                  type="button"
                  onClick={() => setOpenTone((t) => (t === tone ? null : tone))}
                  className="flex w-full items-center gap-2 rounded text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  title={`${TONE_LABEL[tone]}: ${branchesByTone[tone].map((b) => b.branch).join(", ")} — click to see branches`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: TONE_HEX[tone] }} />
                  <span className="min-w-0 flex-1 truncate text-left text-slate-600">{TONE_LABEL[tone]}</span>
                  <span className="shrink-0 font-medium tabular-nums text-slate-900">
                    {counts[tone]} ({Math.round((counts[tone] / total) * 100)}%)
                  </span>
                  <span className="shrink-0 text-slate-400">
                    <ExpandIcon open={isOpen} />
                  </span>
                </button>
                {isOpen ? (
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 pl-4">
                    {branchesByTone[tone].map((b) => (
                      <span key={b.branch} className="inline-flex items-center text-[10px] text-slate-500">
                        {b.branch}
                        {b.onlineStoreBreakdown ? (
                          <button
                            type="button"
                            onClick={() => setOpenBreakdownBranch((br) => (br === b.branch ? null : b.branch))}
                            className="ml-0.5 inline-flex items-center rounded text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                            title={`${b.branch} includes ${b.onlineStoreBreakdown.onlineBranchCode} (online store) — click to split Offtake back apart`}
                          >
                            <ExpandIcon open={openBreakdownBranch === b.branch} />
                          </button>
                        ) : null}
                      </span>
                    ))}
                  </div>
                ) : null}
                {isOpen
                  ? branchesByTone[tone]
                      .filter((b) => b.onlineStoreBreakdown && openBreakdownBranch === b.branch)
                      .map((b) => (
                        <div key={`${b.branch}-breakdown`} className="mt-0.5 space-y-0.5 pl-4">
                          <BreakdownLine
                            label={`${b.branch} (physical)`}
                            actual={b.onlineStoreBreakdown!.ownOfftake}
                            target={b.onlineStoreBreakdown!.ownOfftakeTarget}
                          />
                          <BreakdownLine
                            label={`${b.onlineStoreBreakdown!.onlineBranchCode} (online)`}
                            actual={b.onlineStoreBreakdown!.onlineOfftake}
                            target={b.onlineStoreBreakdown!.onlineOfftakeTarget}
                          />
                        </div>
                      ))
                  : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
