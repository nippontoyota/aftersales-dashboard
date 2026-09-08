"use client";

import { useMemo, useState } from "react";
import { computeHeroSummary, computeKpiSummary, filterBranchesByRegion } from "@/lib/aggregate";
import { formatCompactCurrency, formatNumber } from "@/lib/format";
import { computePace } from "@/lib/pace";
import { REGIONS, type RegionName } from "@/lib/regions";
import type { BranchReport } from "@/lib/report";
import { eyebrow } from "@/lib/ui";
import { RichKpiCard } from "@/components/rich-kpi-card";
import { RevenueIcon, StorefrontIcon, WrenchIcon } from "@/components/dashboard-icons";

type Option = { value: string; label: string; region: RegionName | null; kind: "all" | "region" | "branch" };

/**
 * The five Executive Overview hero cards, with a scope switcher that drives
 * *only these cards* — the rest of the page still follows the header's
 * region filter. HQ / regional managers land on the same All-or-region view
 * they had before (existing behaviour); a branch admin lands on their own
 * branch. Either can then step through every other branch (dropdown, or the
 * ‹ › arrows). Scope is local UI state — it resets on reload, and switching
 * the header date/region re-mounts this with a fresh default.
 */
export function HeroKpiStrip({
  branches,
  date,
  hasPreviousUpload,
  defaultScope,
}: {
  branches: BranchReport[];
  date: string;
  hasPreviousUpload: boolean;
  /** "All", a RegionName, or a branch code — where the switcher starts. */
  defaultScope: string;
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

  const [scope, setScope] = useState<string>(() =>
    options.some((o) => o.value === defaultScope) ? defaultScope : "All",
  );

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
          label="Total Revenue Stream MTD"
          value={formatCompactCurrency(hero.totalRevenueStreamMtd)}
          hasPreviousUpload={hasPreviousUpload}
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
