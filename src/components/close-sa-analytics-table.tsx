"use client";

import { useState } from "react";
import { CollapsibleCard } from "./collapsible-card";
import { formatCompact, formatNumber } from "@/lib/format";
import { partsMatchCoveragePct, type CloseSaPeriodTotals } from "@/lib/close-sa-analytics/aggregate";

/**
 * Close SA Analytics — per Service Advisor totals for a period, built from
 * Service Info + Labour Sales + Part Sale (Cost & Sales deliberately left
 * out, set aside by the user 2026-10-22). One row per Close SA; expand a row
 * for its full Job Desc breakdown and job-mix counts. Used on /branches
 * (HQ, every SA company-wide, `showBranch`) and /dashboard (a branch's own
 * SAs only).
 */

function cell(value: string) {
  return <div className="whitespace-nowrap text-right text-sm tabular-nums text-fg">{value}</div>;
}

function moneyCell(value: number) {
  return cell(`₹${formatCompact(value)}`);
}

/** Parts Revenue is never exhaustive (RefDocNo→RO join confirmed ~65-68%
 * real match rate) — always shown with how many of this SA's ROs it
 * actually covered, so it's never mistaken for the whole picture. */
function partsCell(totals: CloseSaPeriodTotals) {
  const pct = partsMatchCoveragePct(totals);
  return (
    <div className="whitespace-nowrap text-right text-sm tabular-nums text-fg">
      ₹{formatCompact(totals.partsRevenue)}
      <span className="ml-1 text-[11px] font-normal text-fg-faint">
        ({totals.partsMatchedRoCount}/{totals.roCount} ROs{pct !== null ? `, ${Math.round(pct * 100)}%` : ""})
      </span>
    </div>
  );
}

function countsSummary(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

function SaRow({ totals, showBranch }: { totals: CloseSaPeriodTotals; showBranch: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const topJobDescs = Object.entries(totals.jobDescCounts).sort((a, b) => b[1] - a[1]);

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
        <td className="px-3 py-2 align-top">{moneyCell(totals.labourRevenueAfter)}</td>
        <td className="px-3 py-2 align-top">{partsCell(totals)}</td>
        <td className="px-3 py-2 align-top">{moneyCell(totals.vasBillRevenue)}</td>
        <td className="px-3 py-2 align-top">{cell(formatNumber(totals.soldHours))}</td>
        <td className="px-3 py-2 align-top" title="Once per RO, not summed per labour line — see data-sourcing notes">
          {cell(formatNumber(totals.overTargetTotal))}
        </td>
        <td className="px-3 py-2 align-top">{cell(`${totals.appointmentCount} / ${totals.walkinCount}`)}</td>
        <td className="px-3 py-2 align-top">{cell(formatNumber(totals.bpPotentialCount))}</td>
      </tr>
      {expanded ? (
        <tr className="border-t border-border-subtle bg-surface-2/40">
          <td colSpan={10} className="px-3 py-3">
            <div className="grid grid-cols-1 gap-3 text-xs text-fg-subtle sm:grid-cols-3">
              <div>
                <div className="mb-1 font-semibold text-fg-subtle">Job mix</div>
                <div>AMC: {totals.amcCount}, FMSC: {totals.fmscCount}, EM: {totals.emCount}</div>
                <div>Job Type — {countsSummary(totals.jobTypeCounts) || "—"}</div>
                <div>Pay Type — {countsSummary(totals.payTypeCounts) || "—"}</div>
              </div>
              <div>
                <div className="mb-1 font-semibold text-fg-subtle">VAS detail</div>
                <div>Wheel Balancing: {totals.wheelBalancingCount}, Wheel Alignment: {totals.wheelAlignmentCount}</div>
                <div>Brake Skimming: {totals.brakeSkimmingCount}, Evaporator Cleaning: {totals.evaporatorCleaningCount}</div>
              </div>
              <div>
                <div className="mb-1 font-semibold text-fg-subtle">Parts detail (matched ROs only)</div>
                <div>Engine Flush: {totals.engineFlushCount}, Injector Cleaner: {totals.injectorCleanerCount}</div>
                <div>Synthetic Oil: {totals.syntheticOilLtrs.toFixed(1)} L, Brake Cleaning: {totals.brakeCleaningCount}</div>
                <div>DIY: {totals.diyCount} (₹{formatCompact(totals.diyRevenue)}), External Sales: ₹{formatCompact(totals.externalSales)}</div>
              </div>
            </div>
            {totals.bpRoCount > 0 ? (
              <div className="mt-2 text-xs text-fg-subtle">
                <span className="font-semibold">Body &amp; Paint</span> — {totals.bpRoCount} ROs, Estimate ₹{formatCompact(totals.bpEstimateAmount)} vs Final ₹
                {formatCompact(totals.bpFinalInvoiceAmount)}
              </div>
            ) : null}
            <div className="mt-2 text-xs text-fg-subtle">
              <span className="font-semibold">Job Desc breakdown</span> ({topJobDescs.length} distinct) —{" "}
              {topJobDescs.length > 0 ? topJobDescs.map(([k, v]) => `${k}: ${v}`).join(", ") : "—"}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function CloseSaAnalyticsTable({
  totals,
  showBranch = false,
  defaultOpen,
  subtitle,
}: {
  totals: CloseSaPeriodTotals[];
  /** Shows each SA's branch(es) next to their name — /branches (HQ, company-wide) needs this; /dashboard (one branch) doesn't. */
  showBranch?: boolean;
  defaultOpen?: boolean;
  subtitle?: string;
}) {
  if (totals.length === 0) {
    return (
      <CollapsibleCard title="Close SA Analytics" subtitle={subtitle ?? "no Service Info / Labour Sales / Part Sale data for this period"} defaultOpen={defaultOpen}>
        <div className="p-4 text-sm text-fg-subtle">Nothing to show yet.</div>
      </CollapsibleCard>
    );
  }

  return (
    <CollapsibleCard
      title="Close SA Analytics"
      subtitle={subtitle ?? "Service Info + Labour Sales + Part Sale, per Close SA — click a row for detail"}
      defaultOpen={defaultOpen}
      clip
    >
      <div className="max-h-[calc(100dvh-15rem)] overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="text-left text-fg-subtle [&>tr>th]:sticky [&>tr>th]:top-0 [&>tr>th]:z-10 [&>tr>th]:bg-surface-2 [&>tr>th]:shadow-[inset_0_-1px_0_var(--color-border)]">
            <tr>
              <th className="sticky left-0 whitespace-nowrap bg-surface-2 px-3 py-2">Close SA</th>
              <th className="whitespace-nowrap px-3 py-2">ROs</th>
              <th className="whitespace-nowrap px-3 py-2">Vehicles</th>
              <th className="whitespace-nowrap px-3 py-2">Labour ₹</th>
              <th className="whitespace-nowrap px-3 py-2">Parts ₹ (matched)</th>
              <th className="whitespace-nowrap px-3 py-2">VAS ₹</th>
              <th className="whitespace-nowrap px-3 py-2">Sold Hrs</th>
              <th className="whitespace-nowrap px-3 py-2">Over Target</th>
              <th className="whitespace-nowrap px-3 py-2">Appt / Walk-in</th>
              <th className="whitespace-nowrap px-3 py-2">BP Potential</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <SaRow key={`${t.branches.join(",")}|${t.closeSaName}`} totals={t} showBranch={showBranch} />
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}
