"use client";

import { useMemo } from "react";
import { computeHeroSummary, computeKpiSummary, filterBranchesByRegion } from "@/lib/aggregate";
import { formatCompactCurrency, formatNumber } from "@/lib/format";
import { aggregateIncentiveSlabTargets } from "@/lib/incentive-slabs/aggregate";
import type { IncentiveSlabTargets } from "@/lib/incentive-slabs/store";
import { computePace } from "@/lib/pace";
import { REGIONS, type RegionName } from "@/lib/regions";
import type { BranchReport } from "@/lib/report";
import { eyebrow } from "@/lib/ui";
import { RichKpiCard } from "@/components/rich-kpi-card";
import { RevenueIcon, StorefrontIcon, WrenchIcon } from "@/components/dashboard-icons";
import { IncentiveSlabIndicator } from "./incentive-slab-indicator";
import { useSyncedScope } from "./scope-sync";

type Option = { value: string; label: string; region: RegionName | null; kind: "all" | "region" | "branch" };

/** CO01E (Kalamassery Body & Paint) has no VAS/Service Info of its own and
 * shares CO01B's city — its incentive slab thresholds were set as one
 * combined target with CO01B, not two separately achievable ones (confirmed
 * with the user 2026-09-19: viewed alone, neither branch's own revenue ever
 * clears its slabs). Only the Total Revenue Stream card + its incentive
 * slab ring combine them when CO01B is the selected scope — every other
 * hero card (GUS RO, BPU RO, External Sales, VAS) stays CO01B-only, and
 * selecting CO01E on its own is unaffected. */
const CO01B_SLAB_COMBINED_BRANCHES = ["CO01B", "CO01E"];

/**
 * The five Executive Overview hero cards, with a scope switcher that now
 * drives the whole page (2026-09-22: previously *only these cards*, with the
 * rest of the page following a separate header region dropdown — that
 * dropdown was removed for being a second "All" control doing an
 * overlapping job, and this switcher's scope, shared via ScopeSyncProvider/
 * scope-sync.tsx, took over as the page's one live filter). HQ / regional
 * managers land on the same All-or-region view they had before (existing
 * behaviour); a branch admin lands on their own branch. Either can then step
 * through every other branch (dropdown, or the ‹ › arrows). Scope resets on
 * reload, and switching the header date re-mounts this with a fresh default.
 */
export function HeroKpiStrip({
  branches,
  date,
  hasPreviousUpload,
  defaultScope,
  incentiveSlabTargets,
}: {
  branches: BranchReport[];
  date: string;
  hasPreviousUpload: boolean;
  /** "All", a RegionName, or a branch code — where the switcher starts. */
  defaultScope: string;
  /** This month's Slab 1-4 targets, keyed by branch code — loaded server-side
   * from incentive_slab_targets (see /data's upload form). Drives the
   * Incentive Slab Achievement rings embedded in the Total Revenue Stream
   * card below, evaluated against whatever this component's own scope
   * switcher currently has selected (a region/"All" scope sums its member
   * branches' targets — see aggregateIncentiveSlabTargets). Omitted entirely
   * hides the rings (no empty ring placeholder). */
  incentiveSlabTargets?: Record<string, IncentiveSlabTargets>;
}) {
  const options = useMemo<Option[]>(() => {
    const present = new Set(branches.map((b) => b.branch));
    const opts: Option[] = [{ value: "All", label: "All branches", region: null, kind: "all" }];
    for (const region of Object.keys(REGIONS) as RegionName[]) {
      opts.push({ value: region, label: `${region} — region total`, region, kind: "region" });
      for (const code of REGIONS[region]) {
        if (present.has(code)) opts.push({ value: code, label: code, region, kind: "branch" });
      }
    }
    // A branch with data but no region mapping (shouldn't happen with real
    // BA Tool data) still needs to be reachable.
    for (const b of branches) {
      if (!opts.some((o) => o.value === b.branch)) {
        opts.push({ value: b.branch, label: b.branch, region: null, kind: "branch" });
      }
    }
    return opts;
  }, [branches]);

  const [scope, setScope] = useSyncedScope(options.some((o) => o.value === defaultScope) ? defaultScope : "All");

  const idx = Math.max(0, options.findIndex((o) => o.value === scope));
  const current = options[idx];

  const scoped = useMemo(() => {
    if (scope === "All") return branches;
    if (scope in REGIONS) return filterBranchesByRegion(branches, scope as RegionName);
    return branches.filter((b) => b.branch === scope);
  }, [branches, scope]);

  const hero = useMemo(() => computeHeroSummary(scoped), [scoped]);
  const kpis = useMemo(() => computeKpiSummary(scoped), [scoped]);
  const vasPace = useMemo(
    () => computePace(date, kpis.vasAchievementForTheMonth, kpis.vasBillTarget),
    [date, kpis.vasAchievementForTheMonth, kpis.vasBillTarget],
  );

  const isCo01bScope = current?.kind === "branch" && scope === "CO01B";

  // Total Revenue Stream (headline + ring) uses CO01B+CO01E combined when
  // CO01B is selected — see CO01B_SLAB_COMBINED_BRANCHES above. Every other
  // scope (including CO01E on its own) uses the plain `scoped` set, same as
  // `hero` above.
  const revenueScoped = useMemo(
    () => (isCo01bScope ? branches.filter((b) => CO01B_SLAB_COMBINED_BRANCHES.includes(b.branch)) : scoped),
    [isCo01bScope, branches, scoped],
  );
  const revenueHero = useMemo(() => computeHeroSummary(revenueScoped), [revenueScoped]);

  // The ring's target: the selected branch's own thresholds (CO01B+CO01E
  // combined when CO01B is selected), or — for a region/"All" scope — those
  // branches' thresholds summed, same total the source Excel's own
  // region/company subtotal rows held.
  const scopeSlabs = useMemo(() => {
    if (!incentiveSlabTargets) return undefined;
    if (current?.kind === "branch") {
      if (isCo01bScope) return aggregateIncentiveSlabTargets(incentiveSlabTargets, CO01B_SLAB_COMBINED_BRANCHES);
      return incentiveSlabTargets[scope];
    }
    const codes = current?.kind === "region" ? REGIONS[scope as RegionName] : branches.map((b) => b.branch);
    return aggregateIncentiveSlabTargets(incentiveSlabTargets, codes);
  }, [incentiveSlabTargets, current, scope, branches, isCo01bScope]);

  const gusRevenue =
    hero.gusPartsMtd !== null && hero.gusLabourMtd !== null ? hero.gusPartsMtd + hero.gusLabourMtd : null;
  const bpuRevenue =
    hero.bpuPartsMtd !== null && hero.bpuLabourMtd !== null ? hero.bpuPartsMtd + hero.bpuLabourMtd : null;

  // Region optgroups for the dropdown; the plain "All" sits above them.
  const grouped = useMemo(() => {
    const byRegion = new Map<RegionName, Option[]>();
    for (const o of options) {
      if (o.region && (o.kind === "region" || o.kind === "branch")) {
        const list = byRegion.get(o.region) ?? [];
        list.push(o);
        byRegion.set(o.region, list);
      }
    }
    const loose = options.filter((o) => o.kind === "branch" && !o.region);
    return { byRegion, loose };
  }, [options]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className={eyebrow}>Hero figures for</span>
        <div className="inline-flex items-center overflow-hidden rounded-md border border-border-strong bg-surface">
          <button
            type="button"
            aria-label="Previous scope"
            disabled={idx <= 0}
            onClick={() => setScope(options[idx - 1].value)}
            className="flex h-8 w-8 items-center justify-center text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
              <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="Hero card scope"
            className="h-8 border-x border-border-strong bg-surface px-2 text-sm font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            <option value="All">All branches</option>
            {(Object.keys(REGIONS) as RegionName[]).map((region) => {
              const items = grouped.byRegion.get(region);
              if (!items || items.length === 0) return null;
              return (
                <optgroup key={region} label={region}>
                  {items.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              );
            })}
            {grouped.loose.length > 0 ? (
              <optgroup label="Other">
                {grouped.loose.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          <button
            type="button"
            aria-label="Next scope"
            disabled={idx >= options.length - 1}
            onClick={() => setScope(options[idx + 1].value)}
            className="flex h-8 w-8 items-center justify-center text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
              <path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <span className="text-[11px] text-fg-faint">
          {current?.kind === "branch"
            ? "single branch"
            : `${scoped.length} branch${scoped.length === 1 ? "" : "es"}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <RichKpiCard
          icon={<RevenueIcon />}
          color="indigo"
          label={isCo01bScope ? "Total Revenue Stream MTD (incl. CO01E)" : "Total Revenue Stream MTD"}
          value={formatCompactCurrency(revenueHero.totalRevenueStreamMtd)}
          hasPreviousUpload={hasPreviousUpload}
          extra={
            incentiveSlabTargets ? (
              <IncentiveSlabIndicator
                scopeLabel={isCo01bScope ? "CO01B + CO01E" : (current?.value ?? scope)}
                actual={revenueHero.totalRevenueStreamMtd}
                slabs={scopeSlabs}
                date={date}
                showActual={false}
              />
            ) : undefined
          }
        />
        <RichKpiCard
          icon={<RevenueIcon />}
          color="red"
          label="GUS RO — MTD"
          value={formatCompactCurrency(gusRevenue)}
          sub={`${formatNumber(kpis.gusRoMtd)} ROs`}
          hasPreviousUpload={hasPreviousUpload}
        />
        <RichKpiCard
          icon={<WrenchIcon />}
          color="blue"
          label="BPU RO — MTD"
          value={formatCompactCurrency(bpuRevenue)}
          sub={`${formatNumber(kpis.bpuRoMtd)} ROs`}
          hasPreviousUpload={hasPreviousUpload}
        />
        <RichKpiCard
          icon={<RevenueIcon />}
          color="amber"
          label="External Sales MTD"
          value={formatCompactCurrency(kpis.externalSalesMtd)}
          hasPreviousUpload={hasPreviousUpload}
        />
        <RichKpiCard
          icon={<StorefrontIcon />}
          color="indigo"
          label="VAS Achievement"
          value={formatCompactCurrency(kpis.vasAchievementForTheMonth)}
          actual={kpis.vasAchievementForTheMonth}
          target={kpis.vasBillTarget}
          hasPreviousUpload={hasPreviousUpload}
          pace={vasPace}
          formatPaceValue={formatCompactCurrency}
        />
      </div>
    </div>
  );
}
