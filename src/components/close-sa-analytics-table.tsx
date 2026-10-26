"use client";

import { useMemo, useState } from "react";
import { CollapsibleCard } from "./collapsible-card";
import { tglossText } from "./tgloss-text";
import { formatCompact, formatNumber } from "@/lib/format";
import {
  bpLabourGentani,
  bpOtdPct,
  bpPartsGentani,
  bpSmbUtilizationPct,
  bpTglossGentani,
  em60OtdPct,
  emToPmPct,
  sameDayDeliveryPct,
  tglossGentaniVsPitched,
  tglossPitchRatePct,
  type CloseSaPeriodTotals,
} from "@/lib/close-sa-analytics/aggregate";
import { REGIONS, regionForBranch } from "@/lib/regions";

/**
 * SA Analytics (renamed from "Close SA Analytics" 2026-10-23) — per Service
 * Advisor totals for a period, built from Service Info + Labour Sales +
 * Part Sale (Cost & Sales deliberately left out, set aside by the user
 * 2026-10-22). One row per Close SA; expand a row for its full Job Desc
 * breakdown and job-mix counts. Rendered once per GS/BP/Accessories/PDI
 * category by sa-analytics-sections.tsx — this component itself doesn't
 * know about categories beyond `variant`, just renders whatever `totals`
 * it's given. Used on /branches (HQ, every SA company-wide, `showBranch`)
 * and /dashboard (a branch's own SAs only).
 */

/** Which category table this is — each one drops columns/expanded-detail
 * lines that don't apply to it (2026-10-24, at the user's request). "default"
 * is GS, the only variant with every column and every expanded-detail line. */
export type SaVariant = "default" | "bp" | "accessories" | "pdi";

type SortKey =
  | "closeSaName"
  | "roCount"
  | "distinctVehicleCount"
  | "labourRevenueAfter"
  | "partsRevenue"
  | "vasBillRevenue"
  | "tyreCount"
  | "batteryCount"
  | "em60Count"
  | "em60OtdRate"
  | "sameDayDeliveryRate"
  | "bpOtdRate"
  | "bpSmbUtilizationRate";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

function getSortValue(t: CloseSaPeriodTotals, key: SortKey): string | number {
  switch (key) {
    case "closeSaName":
      return t.closeSaName;
    case "roCount":
      return t.roCount;
    case "distinctVehicleCount":
      return t.distinctVehicleCount;
    case "labourRevenueAfter":
      return t.labourRevenueAfter;
    case "partsRevenue":
      return t.partsRevenue;
    case "vasBillRevenue":
      return t.vasBillRevenue;
    case "tyreCount":
      return t.tyreCount;
    case "batteryCount":
      return t.batteryCount;
    case "em60Count":
      return t.em60Count;
    case "em60OtdRate":
      // No EM60 ROs at all → -1, below every real rate (0-1) — sorts to the
      // bottom on a descending click, same as every other "no data" row.
      return em60OtdPct(t) ?? -1;
    case "sameDayDeliveryRate":
      return sameDayDeliveryPct(t) ?? -1;
    case "bpOtdRate":
      return bpOtdPct(t) ?? -1;
    case "bpSmbUtilizationRate":
      return bpSmbUtilizationPct(t) ?? -1;
  }
}

/** Same Central→South→North, alphabetical-within-region branch order the
 * rest of the dashboard uses (see dashboard/revenue-per-vehicle-table.tsx's
 * regionSort) — the default "dealer wise" view (2026-10-22, at the user's
 * request), CO01A first because it's Central's first branch. Within one
 * branch, highest ROs first (unchanged from the previous default). A branch
 * with no region (shouldn't happen with real data) sorts after every real
 * region. On /dashboard (one branch only) every row shares the same branch,
 * so this reduces to the plain ROs-descending order it always was. */
const REGION_ORDER = Object.keys(REGIONS) as (keyof typeof REGIONS)[];

function defaultCompare(a: CloseSaPeriodTotals, b: CloseSaPeriodTotals): number {
  const branchA = a.branches[0] ?? "";
  const branchB = b.branches[0] ?? "";
  const regionA = regionForBranch(branchA);
  const regionB = regionForBranch(branchB);
  const ia = regionA ? REGION_ORDER.indexOf(regionA) : REGION_ORDER.length;
  const ib = regionB ? REGION_ORDER.indexOf(regionB) : REGION_ORDER.length;
  if (ia !== ib) return ia - ib;
  const branchCmp = branchA.localeCompare(branchB);
  if (branchCmp !== 0) return branchCmp;
  return b.roCount - a.roCount;
}

function cell(value: string) {
  return <div className="whitespace-nowrap text-right text-sm tabular-nums text-fg">{value}</div>;
}

function moneyCell(value: number) {
  return cell(`₹${formatCompact(value)}`);
}

/** Parts Revenue is never exhaustive (RefDocNo→RO join confirmed ~65-68%
 * real match rate) — always shown with how many ROs it actually matched, so
 * it's never mistaken for the whole picture. No percentage (2026-10-23, at
 * the user's request) — matched-RO count can exceed this period's own RO
 * count (the match now spans the SA's whole RO history, not just this
 * period's, see compute.ts's module doc comment), which made a literal "%"
 * read as a bug (e.g. "118%") rather than what it actually is. */
function partsCell(totals: CloseSaPeriodTotals) {
  return (
    <div className="whitespace-nowrap text-right text-sm tabular-nums text-fg">
      ₹{formatCompact(totals.partsRevenue)}
      <span className="ml-1 text-[11px] font-normal text-fg-faint">
        ({totals.partsMatchedRoCount}/{totals.roCount} ROs)
      </span>
    </div>
  );
}

/** EM60 On-Time Delivery: Job Open → Invoice at or under 60 minutes. Shown
 * as on-time/total so a 0-count SA (no EM60 ROs) reads as "—", never a
 * misleading "0%". */
function em60OtdCell(totals: CloseSaPeriodTotals) {
  if (totals.em60Count === 0) return <div className="whitespace-nowrap text-right text-sm text-fg-faint">—</div>;
  const pct = em60OtdPct(totals)!;
  return (
    <div className="whitespace-nowrap text-right text-sm tabular-nums text-fg">
      {totals.em60OnTimeCount}/{totals.em60Count}
      <span className="ml-1 text-[11px] font-normal text-fg-faint">({Math.round(pct * 100)}%)</span>
    </div>
  );
}

/** Job Open Date = Invoice Date, same calendar day — any RO, distinct from
 * EM60's 60-minute-specific OTD. */
function sameDayDeliveryCell(totals: CloseSaPeriodTotals) {
  if (totals.roCount === 0) return <div className="whitespace-nowrap text-right text-sm text-fg-faint">—</div>;
  const pct = sameDayDeliveryPct(totals)!;
  return (
    <div className="whitespace-nowrap text-right text-sm tabular-nums text-fg">
      {totals.sameDayDeliveryCount}/{totals.roCount}
      <span className="ml-1 text-[11px] font-normal text-fg-faint">({Math.round(pct * 100)}%)</span>
    </div>
  );
}

/** BP OTD: handover inside [midnight 2 days before Promise, Promise] ÷ ROs
 * where both that and Promise Delivery Date/Time parsed — "—" when neither
 * side was ever on file for this SA's ROs (real coverage is ~87%, not 100%). */
function bpOtdCell(totals: CloseSaPeriodTotals) {
  if (totals.bpOtdEligibleCount === 0) return <div className="whitespace-nowrap text-right text-sm text-fg-faint">—</div>;
  const pct = bpOtdPct(totals)!;
  return (
    <div className="whitespace-nowrap text-right text-sm tabular-nums text-fg" title="Handover from midnight 2 days before the Promise date, through the Promise Delivery Date/Time">
      {totals.bpOtdOnTimeCount}/{totals.bpOtdEligibleCount}
      <span className="ml-1 text-[11px] font-normal text-fg-faint">({Math.round(pct * 100)}%)</span>
    </div>
  );
}

/** Unique Work Order (workOrdNo) ÷ unique BP RO — "—" when the SA has no BP
 * ROs at all. */
function bpSmbUtilizationCell(totals: CloseSaPeriodTotals) {
  if (totals.bpRoCount === 0) return <div className="whitespace-nowrap text-right text-sm text-fg-faint">—</div>;
  const pct = bpSmbUtilizationPct(totals)!;
  return (
    <div className="whitespace-nowrap text-right text-sm tabular-nums text-fg" title="Unique Work Order numbers ÷ unique ROs">
      {totals.bpWorkOrderCount}/{totals.bpRoCount}
      <span className="ml-1 text-[11px] font-normal text-fg-faint">({Math.round(pct * 100)}%)</span>
    </div>
  );
}

function countsSummary(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

/** Per-variant column count, for the expanded row's colSpan — must match
 * exactly how many <td>s SaRow's main <tr> renders for that variant. */
function columnCount(variant: SaVariant): number {
  switch (variant) {
    case "pdi":
      return 4; // Close SA, ROs, Vehicles, Same Day Delivery
    case "accessories":
      return 8; // + Labour/Parts/TGLOSS/Tyre
    case "bp":
      return 10; // Close SA, ROs, Vehicles, Labour/Parts/TGLOSS/Tyre/Battery, OTD, SMB Utilization %
    case "default":
      return 11; // everything
  }
}

/** Each category's own layout (2026-10-24, at the user's request) — see
 * `SaVariant`'s own doc comment for the general idea. Per variant:
 * - bp: drops Same Day Delivery/EM60/EM60 OTD (always empty for BP — no real
 *   EM/PM data), adds its own OTD/SMB Utilization % columns, puts the Body &
 *   Paint block first in the expanded detail (the primary thing worth
 *   looking at there), drops the AMC/FS/EM job-mix line and the EM-to-PM
 *   line (same reason as Same Day Delivery/EM60).
 * - accessories: drops Battery/EM60/EM60 OTD columns, drops the whole Job
 *   mix block, drops EM-to-PM, and Parts detail shows only DIY.
 * - pdi: drops everything past Same Day Delivery (columns and the whole
 *   expanded-detail grid) — only the Job Desc breakdown stays. */
function SaRow({ totals, showBranch, variant }: { totals: CloseSaPeriodTotals; showBranch: boolean; variant: SaVariant }) {
  const [expanded, setExpanded] = useState(false);
  const topJobDescs = Object.entries(totals.jobDescCounts).sort((a, b) => b[1] - a[1]);

  const showSameDayDelivery = variant !== "bp";
  const showMoneyCols = variant !== "pdi"; // Labour ₹/Parts ₹/TGLOSS ₹/Tyre
  const showBattery = variant === "default" || variant === "bp";
  const showEm60Cols = variant === "default";
  const showBpOtdSmbCols = variant === "bp";

  const showDetailGrid = variant !== "pdi";
  const showJobMix = variant === "default" || variant === "bp";
  const showAmcFsEm = variant === "default";
  const showLabourDetail = variant !== "pdi";
  const showEmToPm = variant === "default";
  const showPartsDetail = variant !== "pdi";
  const showFullPartsDetail = variant === "default" || variant === "bp";
  const showBpBlock = totals.bpRoCount > 0 && variant !== "pdi";
  const bpBlockFirst = variant === "bp";

  const bpBlock = showBpBlock ? (
    <div className="text-xs text-fg-subtle">
      <div>
        <span className="font-semibold">Body &amp; Paint</span> — {totals.bpRoCount} ROs, Estimate ₹{formatCompact(totals.bpEstimateAmount)} vs Final ₹
        {formatCompact(totals.bpFinalInvoiceAmount)}
      </div>
      <div>Repair Type — {countsSummary(totals.bpRepairTypeCounts) || "—"}</div>
      <div title="BP Parts ₹ ÷ BP ROs">Parts Gentani: ₹{formatCompact(bpPartsGentani(totals) ?? 0)}</div>
      <div title="BP Labour ₹ ÷ BP ROs">Service Gentani: ₹{formatCompact(bpLabourGentani(totals) ?? 0)}</div>
      <div title="BP TGLOSS ₹ ÷ BP ROs">{tglossText("TGLOSS")} Gentani: ₹{formatCompact(bpTglossGentani(totals) ?? 0)}</div>
    </div>
  ) : null;

  const detailColCount = (showJobMix ? 1 : 0) + (showLabourDetail ? 1 : 0) + (showPartsDetail ? 1 : 0);
  const gridColsClass = detailColCount >= 3 ? "sm:grid-cols-3" : detailColCount === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1";

  return (
    <>
      <tr className="cursor-pointer border-t border-border-subtle hover:bg-surface-2/70" onClick={() => setExpanded((e) => !e)}>
        <td className="whitespace-nowrap bg-surface px-3 py-2 font-medium text-fg">
          <span className={`mr-1.5 inline-block w-3 text-fg-faint transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
          {totals.closeSaName}
          {showBranch ? <span className="ml-2 text-[11px] font-normal text-fg-faint">{totals.branches.join(", ")}</span> : null}
        </td>
        <td className="px-3 py-2 align-top">{cell(formatNumber(totals.roCount))}</td>
        <td className="px-3 py-2 align-top">{cell(formatNumber(totals.distinctVehicleCount))}</td>
        {showSameDayDelivery ? (
          <td className="px-3 py-2 align-top" title="Job Open Date = Invoice Date, same calendar day">
            {sameDayDeliveryCell(totals)}
          </td>
        ) : null}
        {showMoneyCols ? (
          <>
            <td className="px-3 py-2 align-top">{moneyCell(totals.labourRevenueAfter)}</td>
            <td className="px-3 py-2 align-top">{partsCell(totals)}</td>
            <td className="px-3 py-2 align-top">{moneyCell(totals.vasBillRevenue)}</td>
            <td className="px-3 py-2 align-top" title={`${totals.partsMatchedRoCount}/${totals.roCount} ROs matched — same Part Sale coverage as Parts ₹`}>
              {cell(formatNumber(totals.tyreCount))}
            </td>
          </>
        ) : null}
        {showBattery ? (
          <td className="px-3 py-2 align-top" title={`${totals.partsMatchedRoCount}/${totals.roCount} ROs matched — same Part Sale coverage as Parts ₹`}>
            {cell(formatNumber(totals.batteryCount))}
          </td>
        ) : null}
        {showBpOtdSmbCols ? (
          <>
            <td className="px-3 py-2 align-top" title="Handover from midnight 2 days before the Promise date, through the Promise Delivery Date/Time">
              {bpOtdCell(totals)}
            </td>
            <td className="px-3 py-2 align-top" title="Unique Work Order numbers ÷ unique ROs">
              {bpSmbUtilizationCell(totals)}
            </td>
          </>
        ) : null}
        {showEm60Cols ? (
          <>
            <td className="px-3 py-2 align-top">{cell(formatNumber(totals.em60Count))}</td>
            <td className="px-3 py-2 align-top" title="Job Open → Invoice at or under 60 minutes">
              {em60OtdCell(totals)}
            </td>
          </>
        ) : null}
      </tr>
      {expanded ? (
        <tr className="border-t border-border-subtle bg-surface-2/40">
          <td colSpan={columnCount(variant)} className="px-3 py-3">
            {bpBlockFirst && bpBlock ? <div className="mb-2">{bpBlock}</div> : null}
            {showDetailGrid ? (
              <div className={`grid grid-cols-1 gap-3 text-xs text-fg-subtle ${gridColsClass}`}>
                {showJobMix ? (
                  <div>
                    <div className="mb-1 font-semibold text-fg-subtle">Job mix</div>
                    {/* FS = Free Service, confirmed 2026-10-23 to be the same
                        thing already tracked as fmscCount (FMSC Flag) — just
                        relabeled to match the term used elsewhere. */}
                    {showAmcFsEm ? <div>AMC: {totals.amcCount}, FS: {totals.fmscCount}, EM: {totals.emCount}</div> : null}
                    <div>Job Type — {countsSummary(totals.jobTypeCounts) || "—"}</div>
                    {totals.repeatJobCount > 0 ? (
                      <div title="Same car, same Job Code, within 30 days — generic/catch-all codes excluded">
                        Repeat jobs (30-day): {totals.repeatJobCount}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {showLabourDetail ? (
                  <div>
                    <div className="mb-1 font-semibold text-fg-subtle">Labour Detail</div>
                    <div>Wheel Balancing: {totals.wheelBalancingCount}, Wheel Alignment: {totals.wheelAlignmentCount}</div>
                    <div>Brake Skimming: {totals.brakeSkimmingCount}, Evaporator Cleaning: {totals.evaporatorCleaningCount}</div>
                    <div>Mech Care: {totals.mechCareCount}</div>
                    <div title="Distinct ROs with at least one TGLOSS job code — 'pitched' means sold, not offered-and-declined">
                      Pitched: {totals.tglossPitchedRoCount}/{totals.roCount}
                      {tglossPitchRatePct(totals) !== null ? ` (${Math.round(tglossPitchRatePct(totals)! * 100)}%)` : ""}
                    </div>
                    <div title="TGLOSS ₹ ÷ ROs that actually had a TGLOSS job (not ÷ all ROs)">
                      {tglossText("TGLOSS")} Gentani (vs pitched): ₹{formatCompact(tglossGentaniVsPitched(totals) ?? 0)}
                    </div>
                    {showEmToPm ? (
                      <div title="EM-flagged ROs (any tier) ÷ total Periodic Maintenance ROs">
                        EM-to-PM: {totals.pmRoCount > 0 ? `${totals.emCount}/${totals.pmRoCount} (${Math.round((emToPmPct(totals) ?? 0) * 100)}%)` : "—"}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {showPartsDetail ? (
                  <div>
                    <div className="mb-1 font-semibold text-fg-subtle">Parts detail (matched ROs only)</div>
                    {showFullPartsDetail ? (
                      <>
                        <div>Engine Flush: {totals.engineFlushCount}, Injector Cleaner: {totals.injectorCleanerCount}</div>
                        <div>Synthetic Oil: {totals.syntheticOilLtrs.toFixed(1)} L, Brake Cleaning: {totals.brakeCleaningCount}</div>
                        <div>Brake Cleaning Labour: {totals.brakeCleaningLabourCount}</div>
                      </>
                    ) : null}
                    <div>DIY: {totals.diyCount} (₹{formatCompact(totals.diyRevenue)})</div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {!bpBlockFirst && bpBlock ? <div className="mt-2">{bpBlock}</div> : null}
            <div className="mt-3 max-w-xl">
              <div className="mb-1 text-xs font-semibold text-fg-subtle">Job Desc breakdown ({topJobDescs.length} distinct)</div>
              {topJobDescs.length > 0 ? (
                // A plain table here stretches to this row's full width — the
                // same width as the wide, horizontally-scrolled outer table —
                // pushing the count off past whatever's currently in view
                // (found 2026-10-22). max-w-xl above + a flex row per item
                // keeps every count right next to its description instead.
                <div className="max-h-48 overflow-y-auto rounded border border-border-subtle bg-surface">
                  {topJobDescs.map(([desc, count], i) => (
                    <div key={desc} className={`flex items-baseline justify-between gap-3 px-2 py-1 text-xs ${i % 2 === 1 ? "bg-surface-2/40" : ""}`}>
                      <span className="text-fg-subtle">{desc}</span>
                      <span className="shrink-0 font-medium tabular-nums text-fg">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-fg-faint">—</div>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** A clickable column header — 1st click sorts the whole table (breaking out
 * of the default per-branch grouping) descending by this column, 2nd click
 * ascending, 3rd click back to the default dealer-wise view (2026-10-22, at
 * the user's request: "so if I click on Labour, I can see who has the
 * highest across all branches"). */
function SortableHeader({ label, sortKey, sort, onClick, sticky }: { label: React.ReactNode; sortKey: SortKey; sort: SortState; onClick: (key: SortKey) => void; sticky?: boolean }) {
  const active = sort?.key === sortKey;
  return (
    <th
      className={`${sticky ? "sticky left-0" : ""} cursor-pointer select-none whitespace-nowrap bg-surface-2 px-3 py-2 hover:text-fg`}
      onClick={() => onClick(sortKey)}
    >
      {label}
      <span className="ml-1 inline-block w-2.5 text-[10px] text-fg-faint">{active ? (sort!.dir === "desc" ? "▼" : "▲") : ""}</span>
    </th>
  );
}

export function CloseSaAnalyticsTable({
  totals,
  showBranch = false,
  defaultOpen,
  subtitle,
  title = "SA Analytics",
  variant = "default",
}: {
  totals: CloseSaPeriodTotals[];
  /** Shows each SA's branch(es) next to their name — /branches (HQ, company-wide) needs this; /dashboard (one branch) doesn't. */
  showBranch?: boolean;
  defaultOpen?: boolean;
  subtitle?: string;
  /** Lets a category section (GS/BP/Accessories/PDI) distinguish itself —
   * see sa-analytics-sections.tsx. Defaults to the plain title. */
  title?: string;
  /** Each category's own column/expanded-detail layout — see SaVariant and
   * SaRow's own doc comments. Defaults to GS's full layout. */
  variant?: SaVariant;
}) {
  const [sort, setSort] = useState<SortState>(null);

  const handleHeaderClick = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  };

  const sortedTotals = useMemo(() => {
    if (!sort) return [...totals].sort(defaultCompare);
    return [...totals].sort((a, b) => {
      const va = getSortValue(a, sort.key);
      const vb = getSortValue(b, sort.key);
      const cmp = typeof va === "string" || typeof vb === "string" ? String(va).localeCompare(String(vb)) : (va as number) - (vb as number);
      return sort.dir === "desc" ? -cmp : cmp;
    });
  }, [totals, sort]);

  if (totals.length === 0) {
    return (
      <CollapsibleCard title={title} subtitle={subtitle ?? "no Service Info / Labour Sales / Part Sale data for this period"} defaultOpen={defaultOpen}>
        <div className="p-4 text-sm text-fg-subtle">Nothing to show yet.</div>
      </CollapsibleCard>
    );
  }

  const showSameDayDelivery = variant !== "bp";
  const showMoneyCols = variant !== "pdi";
  const showBattery = variant === "default" || variant === "bp";
  const showEm60Cols = variant === "default";
  const showBpOtdSmbCols = variant === "bp";

  return (
    <CollapsibleCard
      title={title}
      subtitle={subtitle ?? "Service Info + Labour Sales + Part Sale, per Close SA — click a row for detail, click a header to sort"}
      defaultOpen={defaultOpen}
      clip
    >
      <div className="max-h-[calc(100dvh-15rem)] overflow-auto">
        <table className="text-xs">
          <thead className="text-left text-fg-subtle [&>tr>th]:sticky [&>tr>th]:top-0 [&>tr>th]:z-10 [&>tr>th]:bg-surface-2 [&>tr>th]:shadow-[inset_0_-1px_0_var(--color-border)]">
            <tr>
              <SortableHeader label="Close SA" sortKey="closeSaName" sort={sort} onClick={handleHeaderClick} sticky />
              <SortableHeader label="ROs" sortKey="roCount" sort={sort} onClick={handleHeaderClick} />
              <SortableHeader label="Vehicles" sortKey="distinctVehicleCount" sort={sort} onClick={handleHeaderClick} />
              {showSameDayDelivery ? <SortableHeader label="Same Day Delivery" sortKey="sameDayDeliveryRate" sort={sort} onClick={handleHeaderClick} /> : null}
              {showMoneyCols ? (
                <>
                  <SortableHeader label="Labour ₹" sortKey="labourRevenueAfter" sort={sort} onClick={handleHeaderClick} />
                  <SortableHeader label="Parts ₹ (matched)" sortKey="partsRevenue" sort={sort} onClick={handleHeaderClick} />
                  <SortableHeader label={tglossText("TGLOSS ₹")} sortKey="vasBillRevenue" sort={sort} onClick={handleHeaderClick} />
                  <SortableHeader label="Tyre" sortKey="tyreCount" sort={sort} onClick={handleHeaderClick} />
                </>
              ) : null}
              {showBattery ? <SortableHeader label="Battery" sortKey="batteryCount" sort={sort} onClick={handleHeaderClick} /> : null}
              {showBpOtdSmbCols ? (
                <>
                  <SortableHeader label="OTD" sortKey="bpOtdRate" sort={sort} onClick={handleHeaderClick} />
                  <SortableHeader label="SMB Utilization %" sortKey="bpSmbUtilizationRate" sort={sort} onClick={handleHeaderClick} />
                </>
              ) : null}
              {showEm60Cols ? (
                <>
                  <SortableHeader label="EM60" sortKey="em60Count" sort={sort} onClick={handleHeaderClick} />
                  <SortableHeader label="EM60 OTD" sortKey="em60OtdRate" sort={sort} onClick={handleHeaderClick} />
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {sortedTotals.map((t) => (
              <SaRow key={`${t.branches.join(",")}|${t.closeSaName}`} totals={t} showBranch={showBranch} variant={variant} />
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}
