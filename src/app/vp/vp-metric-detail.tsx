"use client";

import { useEffect, type ReactNode } from "react";
import { formatCompact, formatCompactCurrency, formatPercent } from "@/lib/format";
import { REGIONS, type RegionName } from "@/lib/regions";
import type { CompareBranchData } from "./vp-compare-data";
import { ITEMS, METRICS, formatMetric, itemPool, rankPool, type ItemKey, type MetricKey, type RankedRow } from "./vp-metrics";

const REGION_ORDER = Object.keys(REGIONS) as RegionName[];

/**
 * "Why is this number what it is" for any figure on the VP page (2026-09-28,
 * extending the GUS-per-car detail modal to every metric). Clicked on a
 * branch's own cell it ranks that branch against every branch and shows the
 * related figures behind it; clicked on a Group/region figure it lists that
 * scope's branches, ranked, with each one's share. All numbers come from the
 * compare data the page already holds, so nothing is fetched.
 */
export type MetricRequest = {
  metric: MetricKey;
  /** A branch's own figure. */
  branch?: string;
  /** Or a scope's (Group = region null). */
  scope?: { label: string; region: string | null };
  /** The figure as the page shows it (the scope's own total, or the branch's cell). */
  value: number | null;
};

const TONE_BADGE = { good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", critical: "bg-bad-soft text-bad" } as const;

function rankTone(rank: number, total: number): keyof typeof TONE_BADGE {
  if (total <= 1) return "good";
  const pct = (rank - 1) / (total - 1);
  if (pct <= 1 / 3) return "good";
  if (pct <= 2 / 3) return "warn";
  return "critical";
}

function average(rows: RankedRow[]): number | null {
  return rows.length ? rows.reduce((s, r) => s + r.value, 0) / rows.length : null;
}

type RegionRollup = { region: RegionName; value: number; branchCount: number };

/** Rolls a Group-level pool up by region, Central/South/North order — shown
 * above the flat branch list so the VP sees "which region" before "which
 * branch" (2026-10-01, at the VP's request). Additive metrics (MTD rupee/
 * count figures) sum each region's branches; non-additive ones (achievement
 * %) average them, same unweighted convention the Average tile already
 * uses. Branches with no mapped region (shouldn't happen with real data)
 * are left out rather than guessed into one. */
function regionRollups(pool: RankedRow[], all: CompareBranchData[], additive: boolean | undefined): RegionRollup[] {
  const byRegion = new Map<RegionName, RankedRow[]>();
  for (const row of pool) {
    const region = all.find((d) => d.branch === row.branch)?.region as RegionName | null | undefined;
    if (!region) continue;
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region)!.push(row);
  }
  return REGION_ORDER.filter((r) => byRegion.has(r)).map((region) => {
    const rows = byRegion.get(region)!;
    const value = additive ? rows.reduce((s, r) => s + r.value, 0) : (average(rows) ?? 0);
    return { region, value, branchCount: rows.length };
  });
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="rounded p-1 text-fg-muted hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent"
    >
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    </button>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2/40 p-2.5">
      <div className="truncate text-[9.5px] uppercase tracking-[0.08em] text-fg-faint">{label}</div>
      <div className={`mt-1 text-sm font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function DriverRow({ metric, branch, all }: { metric: MetricKey; branch: string; all: CompareBranchData[] }) {
  const def = METRICS[metric];
  if (def.gusOnly && all.find((d) => d.branch === branch)?.bodyPaintOnly) return null;
  const pool = rankPool(all, metric);
  const idx = pool.findIndex((r) => r.branch === branch);
  const mine = idx >= 0 ? pool[idx].value : null;
  const avg = average(pool);
  const below = mine !== null && avg !== null && mine < avg;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-2/30 px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium text-fg">{def.label}</div>
        <div className="text-[10.5px] text-fg-faint">avg {formatMetric(avg, def.kind)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-right">
        <span className={`text-sm font-semibold tabular-nums ${mine === null ? "text-fg-faint" : below ? "text-bad" : "text-fg"}`}>{formatMetric(mine, def.kind)}</span>
        {idx >= 0 ? (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_BADGE[rankTone(idx + 1, pool.length)]}`}>
            #{idx + 1}/{pool.length}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ItemRow({ item, branch, scopeBranches, all }: { item: ItemKey; branch?: string; scopeBranches: CompareBranchData[]; all: CompareBranchData[] }) {
  const def = ITEMS[item];
  const pool = itemPool(branch ? all : scopeBranches, item);
  if (pool.length === 0) return null;
  const avgPen = pool.reduce((s, r) => s + r.pen, 0) / pool.length;

  let count: number;
  let pen: number;
  let revenue: number | null = null;
  let rankBadge: ReactNode = null;
  let detail: string;
  if (branch) {
    const idx = pool.findIndex((r) => r.branch === branch);
    if (idx < 0) return null;
    count = pool[idx].count;
    pen = pool[idx].pen;
    revenue = pool[idx].revenue;
    rankBadge = (
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_BADGE[rankTone(idx + 1, pool.length)]}`}>
        #{idx + 1} of {pool.length}
      </span>
    );
    detail = `avg ${formatPercent(avgPen)} of ${def.denomLabel}`;
  } else {
    count = pool.reduce((s, r) => s + r.count, 0);
    pen = count / pool.reduce((s, r) => s + r.denom, 0);
    revenue = def.revenue ? pool.reduce((s, r) => s + (r.revenue ?? 0), 0) : null;
    const top = pool[0];
    const last = pool[pool.length - 1];
    detail = pool.length > 1 ? `#1 ${top.branch} ${formatPercent(top.pen)} · last ${last.branch} ${formatPercent(last.pen)}` : `of ${def.denomLabel}`;
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2/30 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-fg">
          {def.label}
          {def.note ? <span className="ml-1.5 text-[10px] font-normal text-fg-faint">{def.note}</span> : null}
        </span>
        <span className="text-right">
          <span className="text-sm font-semibold tabular-nums text-fg">{formatPercent(pen)}</span>
          <span className="ml-1.5 text-[11px] tabular-nums text-fg-faint">
            ({formatCompact(count)}
            {revenue !== null ? ` · ${formatCompactCurrency(revenue)}` : ""})
          </span>
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {rankBadge}
        <span className="text-[10.5px] text-fg-faint">{detail}</span>
      </div>
    </div>
  );
}

export function MetricDetailModal({ request, all, onClose }: { request: MetricRequest; all: CompareBranchData[]; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const def = METRICS[request.metric];
  const scoped = request.scope?.region ? all.filter((d) => d.region === request.scope!.region) : all;
  const pool = rankPool(scoped, request.metric);
  const isBranch = request.branch !== undefined;
  const idx = isBranch ? pool.findIndex((r) => r.branch === request.branch) : -1;
  const leader = pool[0];
  const last = pool[pool.length - 1];
  const avg = average(pool);
  const total = request.value ?? 0;
  /** Only when this is a Group-level figure (no branch, no region already
   * picked) — a region-scoped grid column or a branch's own cell has
   * nothing left to roll up further. */
  const showRegions = !isBranch && !request.scope?.region;
  const regions = showRegions ? regionRollups(pool, all, def.additive) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-border-subtle px-5 pb-3 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-faint">{request.branch ?? request.scope?.label}</div>
              <h2 className="mt-0.5 text-lg font-semibold text-fg">{def.label}</h2>
            </div>
            <CloseButton onClose={onClose} />
          </div>
          <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-fg">{formatMetric(request.value, def.kind)}</div>
        </div>

        <div className="overflow-auto px-5 pb-5">

        {isBranch && idx >= 0 && leader ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-1 text-xs font-semibold ${TONE_BADGE[rankTone(idx + 1, pool.length)]}`}>
              #{idx + 1} of {pool.length}
            </span>
            <span className="text-xs text-fg-faint">
              {idx === 0 ? "Leading the group" : `${formatMetric(leader.value - pool[idx].value, def.kind)} behind ${leader.branch}`}
            </span>
          </div>
        ) : isBranch ? (
          <p className="mt-3 text-xs text-fg-faint">No figure to rank for this branch yet this month.</p>
        ) : null}

        {leader && last && pool.length > 1 ? (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Tile label={`#1 · ${leader.branch}`} value={formatMetric(leader.value, def.kind)} tone="text-good" />
            <Tile label="Average" value={formatMetric(avg, def.kind)} tone="text-fg" />
            <Tile label={`Last · ${last.branch}`} value={formatMetric(last.value, def.kind)} tone="text-bad" />
          </div>
        ) : null}

        {isBranch && def.drivers?.length ? (
          <div className="mt-5">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-faint">Behind the number</div>
            <div className="mt-2.5 space-y-2">
              {def.drivers.map((m) => (
                <DriverRow key={m} metric={m} branch={request.branch!} all={all} />
              ))}
            </div>
          </div>
        ) : null}

        {def.items?.length ? (
          <div className="mt-5">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-faint">Add-on services · MTD</div>
            <div className="mt-2.5 space-y-2">
              {def.items.map((item) => (
                <ItemRow key={item} item={item} branch={request.branch} scopeBranches={scoped} all={all} />
              ))}
            </div>
          </div>
        ) : null}

        {showRegions && regions.length > 0 ? (
          <div className="mt-5">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-faint">By region</div>
            <div className="mt-2.5 space-y-1.5">
              {regions.map((r) => {
                const share = def.additive && total > 0 ? r.value / total : null;
                return (
                  <div key={r.region} className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-2/30 px-3 py-2">
                    <span className="text-[12px] font-medium text-fg">
                      {r.region} <span className="text-[10.5px] font-normal text-fg-faint">({r.branchCount} branch{r.branchCount === 1 ? "" : "es"})</span>
                    </span>
                    <span className="text-right">
                      <span className="text-sm font-semibold tabular-nums text-fg">{formatMetric(r.value, def.kind)}</span>
                      {share !== null ? <span className="ml-1.5 text-[10.5px] tabular-nums text-fg-faint">{formatPercent(share)}</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-5">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-faint">
            {isBranch ? "All branches, ranked" : `${request.scope?.label} branches, ranked`}
          </div>
          <div className="mt-2.5 space-y-1.5">
            {pool.length === 0 ? (
              <p className="text-xs text-fg-faint">No branch has a figure for this yet this month.</p>
            ) : (
              pool.map((r, i) => {
                const mine = r.branch === request.branch;
                const share = !isBranch && def.additive && total > 0 ? r.value / total : null;
                return (
                  <div
                    key={r.branch}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${mine ? "border-accent bg-accent-soft/40" : "border-border-subtle bg-surface-2/30"}`}
                  >
                    <span className="flex items-center gap-2 text-[12px] font-medium text-fg">
                      <span className="w-5 text-[10.5px] tabular-nums text-fg-faint">{i + 1}</span>
                      {r.branch}
                      {i === 0 && pool.length > 1 ? <span className="rounded bg-good-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-good">TOP</span> : null}
                      {i === pool.length - 1 && pool.length > 1 ? <span className="rounded bg-bad-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-bad">LOWEST</span> : null}
                    </span>
                    <span className="text-right">
                      <span className="text-sm font-semibold tabular-nums text-fg">{formatMetric(r.value, def.kind)}</span>
                      {share !== null ? <span className="ml-1.5 text-[10.5px] tabular-nums text-fg-faint">{formatPercent(share)}</span> : null}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
