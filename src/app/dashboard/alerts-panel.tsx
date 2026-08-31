"use client";

import { useState } from "react";
import Link from "next/link";
import type { BranchReport, OnlineStoreBreakdown } from "@/lib/report";
import { achievementRatio, achievementTone, hasActualWithoutTarget } from "@/lib/aggregate";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import { regionForBranch, type RegionName } from "@/lib/regions";

type Alert = {
  branch: string;
  metric: string;
  ratio: number;
  actual: number | null;
  target: number | null;
  tone: "critical" | "warn";
  /** Only set for an Offtake alert on a branch that absorbed an online-store
   * code (CO01A + CO01C) — lets the row offer the same expand-to-split
   * view the branch heatmap has. */
  onlineStoreBreakdown?: OnlineStoreBreakdown;
};

export type WatchedMetric = { label: string; actual: keyof BranchReport; target: keyof BranchReport };

/** BPU/Offtake/Parts Retail/PM+OC moved to their own watched list on the
 * TKM Targets page (2026-08-31) — this default is what's left on the main
 * dashboard's Alerts. */
const DEFAULT_WATCHED: WatchedMetric[] = [{ label: "VAS", actual: "vasAchievementForTheMonth", target: "vasBillTarget" }];

const COLLAPSED_COUNT = 4;

type Tab = "critical" | "watch" | "all";

const TONE_ICON_BG: Record<"critical" | "warn", string> = {
  critical: "bg-red-50 text-red-600",
  warn: "bg-amber-50 text-amber-600",
};
const TONE_TEXT: Record<"critical" | "warn", string> = {
  critical: "text-red-600",
  warn: "text-amber-600",
};

function computeAlerts(branches: BranchReport[], watched: WatchedMetric[]): Alert[] {
  const alerts: Alert[] = [];
  for (const b of branches) {
    for (const w of watched) {
      const actual = b[w.actual] as number | null;
      const target = b[w.target] as number | null;
      const ratio = achievementRatio(actual, target);
      const tone = achievementTone(ratio);
      if (tone === "critical" || tone === "warn") {
        alerts.push({
          branch: b.branch,
          metric: w.label,
          ratio: ratio!,
          actual,
          target,
          tone,
          onlineStoreBreakdown: w.label === "Offtake" ? b.onlineStoreBreakdown : undefined,
        });
      }
    }
  }
  return alerts.sort((a, b) => a.ratio - b.ratio);
}

function ExpandIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
      <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One "└ CO01A (physical): 98.4%" / "└ CO01C (online): 1,287" line for the
 * expanded state — same split-back-apart math as the heatmap's sub-rows,
 * just rendered as plain text to match the Alerts list's layout. */
function BreakdownLine({ label, actual, target }: { label: string; actual: number | null; target: number | null }) {
  const ratio = achievementRatio(actual, target);
  const activityOnly = hasActualWithoutTarget(actual, target);
  const display = ratio !== null ? formatPercent(ratio) : activityOnly ? formatCompact(actual) : "—";
  return (
    <div className="text-[11px] text-slate-400">
      └ {label} <span className={`font-medium ${activityOnly ? "text-sky-700" : "text-slate-500"}`}>{display}</span>
    </div>
  );
}

function AlertRow({
  a,
  isOpen,
  onToggle,
  showBranch = true,
}: {
  a: Alert;
  isOpen: boolean;
  onToggle: () => void;
  /** Off when a branch heading already names the branch (the nested
   * zone → branch view) — repeating it on every row would be noise. */
  showBranch?: boolean;
}) {
  const breakdown = a.onlineStoreBreakdown;
  return (
    <li className="text-xs">
      <div
        className="flex items-start gap-2.5"
        title={`${a.branch} — ${a.metric}: ${formatNumber(a.actual)} of ${formatNumber(a.target)} target (${formatPercent(a.ratio)})`}
      >
        <AlertIcon tone={a.tone} />
        <span className="min-w-0 flex-1 text-slate-700">
          {showBranch ? <span className="font-medium text-slate-900">{a.branch}</span> : null}
          {showBranch ? " — " : null}
          {a.metric} at <span className={`font-semibold tabular-nums ${TONE_TEXT[a.tone]}`}>{formatPercent(a.ratio)}</span> of target
          {breakdown ? (
            <button
              type="button"
              onClick={onToggle}
              className="ml-1.5 inline-flex items-center rounded text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              title={`${a.branch} includes ${breakdown.onlineBranchCode} (online store) — click to split ${a.metric} back apart`}
            >
              <ExpandIcon open={isOpen} />
            </button>
          ) : null}
        </span>
      </div>
      {breakdown && isOpen ? (
        <div className="ml-[30px] mt-1 space-y-0.5">
          <BreakdownLine label={`${a.branch} (physical)`} actual={breakdown.ownOfftake} target={breakdown.ownOfftakeTarget} />
          <BreakdownLine label={`${breakdown.onlineBranchCode} (online)`} actual={breakdown.onlineOfftake} target={breakdown.onlineOfftakeTarget} />
        </div>
      ) : null}
    </li>
  );
}

const REGION_ORDER: RegionName[] = ["Central", "South", "North"];

/** Groups an already worst-first-sorted alert list by branch, without
 * re-sorting: a branch's first appearance in that list is necessarily its
 * own worst alert, so the order branches are first seen in already is
 * "worst branch first" — and each branch's own alerts stay worst-first too. */
function groupByBranchWorstFirst(items: Alert[]): { branch: string; items: Alert[] }[] {
  const order: string[] = [];
  const byBranch = new Map<string, Alert[]>();
  for (const a of items) {
    if (!byBranch.has(a.branch)) {
      byBranch.set(a.branch, []);
      order.push(a.branch);
    }
    byBranch.get(a.branch)!.push(a);
  }
  return order.map((branch) => ({ branch, items: byBranch.get(branch)! }));
}

function AlertIcon({ tone }: { tone: "critical" | "warn" }) {
  return (
    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${TONE_ICON_BG[tone]}`}>
      {tone === "critical" ? (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3 w-3" aria-hidden="true">
          <path d="M8 5v3.5M8 11h.01" strokeLinecap="round" />
          <circle cx="8" cy="8" r="6.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3 w-3" aria-hidden="true">
          <path d="M8 2.5l6.5 11h-13z" strokeLinejoin="round" />
          <path d="M8 6.5v3.2M8 11.8h.01" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

/** Surfaces branches below target across the four confirmed achievement
 * metrics — real tone detection (the same logic behind the colored badges
 * everywhere else), not a fabricated notifications feed. Critical/Watch/All
 * tabs split by tone; `variant="preview"` (the Dashboard's condensed view)
 * caps the list and links "View all" to the full /alerts page instead of
 * expanding in place. */
export function AlertsPanel({
  branches,
  variant = "full",
  watched = DEFAULT_WATCHED,
}: {
  branches: BranchReport[];
  variant?: "preview" | "full";
  /** Defaults to the main dashboard's own set (VAS only); the TKM Targets page passes its BPU/Offtake/Parts Retail/PM+OC watched list instead. */
  watched?: WatchedMetric[];
}) {
  const [tab, setTab] = useState<Tab>("critical");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const alerts = computeAlerts(branches, watched);
  const critical = alerts.filter((a) => a.tone === "critical");
  const watch = alerts.filter((a) => a.tone === "warn");
  const shownAll = tab === "critical" ? critical : tab === "watch" ? watch : alerts;
  const shown = variant === "preview" ? shownAll.slice(0, COLLAPSED_COUNT) : shownAll;

  // Full view groups worst-first alerts by zone (Central/South/North, in
  // that order) so a reader can scan one region at a time instead of
  // hunting through an interleaved list — each zone's own items stay
  // worst-first since `shown` is already sorted that way before grouping.
  // The compact Dashboard preview stays a flat list; zone headers on a
  // 4-item preview would add clutter, not clarity.
  const zoneGroups =
    variant === "full"
      ? REGION_ORDER.map((region) => ({ region, items: shown.filter((a) => regionForBranch(a.branch) === region) })).filter(
          (g) => g.items.length > 0
        )
      : null;

  return (
    <div className="flex h-full flex-col rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs font-semibold">
          {(
            [
              ["critical", `Critical (${critical.length})`],
              ["watch", `Watch (${watch.length})`],
              ["all", `All (${alerts.length})`],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                tab === key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {variant === "preview" && shownAll.length > COLLAPSED_COUNT ? (
          <Link href="/alerts" className="shrink-0 text-[11px] font-medium text-red-600 hover:underline">
            View all
          </Link>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <div className="mt-3 text-xs text-slate-400">Nothing here — every branch is at or above target for this tab.</div>
      ) : zoneGroups ? (
        <div className="mt-3 max-h-[520px] space-y-4 overflow-y-auto pr-1">
          {zoneGroups.map(({ region, items }) => (
            <div key={region}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {region} <span className="font-normal normal-case text-slate-300">({items.length})</span>
              </h3>
              <div className="mt-1.5 space-y-2">
                {groupByBranchWorstFirst(items).map(({ branch, items: branchItems }) => (
                  <div key={branch}>
                    <div className="text-[10px] font-semibold text-slate-500">
                      {branch} <span className="font-normal text-slate-300">({branchItems.length})</span>
                    </div>
                    <ul className="mt-0.5 space-y-1.5 pl-1">
                      {branchItems.map((a) => {
                        const key = `${a.branch}-${a.metric}`;
                        return <AlertRow key={key} a={a} isOpen={expanded.has(key)} onToggle={() => toggle(key)} showBranch={false} />;
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {shown.map((a) => {
            const key = `${a.branch}-${a.metric}`;
            return <AlertRow key={key} a={a} isOpen={expanded.has(key)} onToggle={() => toggle(key)} />;
          })}
        </ul>
      )}
    </div>
  );
}
