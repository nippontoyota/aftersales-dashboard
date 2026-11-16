"use client";

import { Fragment, useMemo, useState } from "react";
import { branchName } from "@/lib/branch-names";
import { control } from "@/lib/ui";
import type { GroupReportRow, PivotRow, RoiRow, SummaryRow } from "@/lib/bp-referrals/group-report";
import type { RegionName } from "@/lib/regions";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function fmtDate(v: Date | string | null): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle";
const thR = "px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle";
const tdR = "px-3 py-2 text-right tabular-nums text-fg";

// Raw Log gets its own, tighter cell styles (2026-11-16, at the user's
// request — the widest section here, so the one that actually needs to fit
// more into less width before it has to scroll sideways).
const thRaw = "px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle";
const thRRaw = "px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle";
const tdRaw = "px-2 py-1.5 text-xs text-fg-muted";
const tdRRaw = "px-2 py-1.5 text-right text-xs tabular-nums text-fg";

type Tab = "pivot" | "summary" | "roi" | "raw";

const TAB_LABEL: Record<Tab, string> = {
  pivot: "Branch Pivot",
  summary: "Summary",
  roi: "ROI",
  raw: "Raw Log",
};

const RAW_LOG_PAGE_SIZE = 50;

/**
 * The Group Report's four sections (2026-11-16, at the user's request —
 * these used to all render stacked on one long page). Each is now its own
 * tab, and Raw Log — the one that can actually grow long (a whole year of
 * referrals) and the widest table here — gets a branch filter and row
 * pagination on top, both purely client-side since every row is already
 * loaded; no extra server round trip. Branch Pivot/Summary/ROI don't need
 * pagination of their own: they're naturally bounded by the number of
 * branches/regions, never more than a few dozen rows.
 */
export function GroupReportTabs({
  pivot,
  summary,
  roi,
  rows,
  regionOrder,
}: {
  pivot: PivotRow[];
  summary: { byRegion: Map<RegionName, SummaryRow[]>; regionTotals: Map<RegionName, SummaryRow>; grandTotal: SummaryRow };
  roi: RoiRow[];
  rows: GroupReportRow[];
  regionOrder: RegionName[];
}) {
  const [tab, setTab] = useState<Tab>("pivot");
  const [rawBranch, setRawBranch] = useState<string>("all");
  const [rawPage, setRawPage] = useState(0);

  // Only the branches actually present in this report's own rows — for a
  // bp_manager/branch viewer (already scoped to one branch) that's at most
  // one option, so the selector just doesn't render at all for them.
  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.assignedBranch) set.add(r.assignedBranch);
    return [...set].sort();
  }, [rows]);

  const filteredRawRows = useMemo(
    () => (rawBranch === "all" ? rows : rows.filter((r) => r.assignedBranch === rawBranch)),
    [rows, rawBranch],
  );

  const rawPageCount = Math.max(1, Math.ceil(filteredRawRows.length / RAW_LOG_PAGE_SIZE));
  const clampedPage = Math.min(rawPage, rawPageCount - 1);
  const pagedRawRows = filteredRawRows.slice(clampedPage * RAW_LOG_PAGE_SIZE, (clampedPage + 1) * RAW_LOG_PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border-subtle">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t ? "border-accent text-accent-text" : "border-transparent text-fg-muted hover:bg-surface-2"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "pivot" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className={th}>Branch</th>
                <th className={thR}>Count</th>
                <th className={thR}>Invoiced Amt</th>
                <th className={thR}>₹50 — Count</th>
                <th className={thR}>₹50 — Amt</th>
                <th className={thR}>₹200 — Count</th>
                <th className={thR}>₹200 — Amt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pivot.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-fg-muted">No referrals in this range.</td></tr>
              ) : (
                pivot.map((p) => (
                  <tr key={p.branch}>
                    <td className="px-3 py-2 font-medium text-fg">{branchName(p.branch)} ({p.branch})</td>
                    <td className={tdR}>{p.count}</td>
                    <td className={tdR}>{inr(p.invoicedAmount)}</td>
                    <td className={tdR}>{p.incentive1Count}</td>
                    <td className={tdR}>{inr(p.incentive1Amount)}</td>
                    <td className={tdR}>{p.incentive2Count}</td>
                    <td className={tdR}>{inr(p.incentive2Amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "summary" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className={th}>Region</th>
                <th className={th}>Branch</th>
                <th className={thR}>Referrals</th>
                <th className={thR}>Converted</th>
                <th className={thR}>₹50 Count</th>
                <th className={thR}>₹50 Amt</th>
                <th className={thR}>₹200 Count</th>
                <th className={thR}>₹200 Amt</th>
                <th className={thR}>Revenue</th>
                <th className={thR}>Parts Rev.</th>
                <th className={thR}>Parts Margin</th>
                <th className={thR}>Labour Rev.</th>
                <th className={thR}>Labour Margin</th>
                <th className={thR}>Total Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {regionOrder.map((region) => {
                const branchRows = summary.byRegion.get(region);
                if (!branchRows || branchRows.length === 0) return null;
                const total = summary.regionTotals.get(region)!;
                return (
                  <Fragment key={region}>
                    {branchRows.map((b, i) => (
                      <tr key={`${region}-${b.branch}`}>
                        <td className="px-3 py-2 text-fg-muted">{i === 0 ? region : ""}</td>
                        <td className="px-3 py-2 font-medium text-fg">{branchName(b.branch!)} ({b.branch})</td>
                        <td className={tdR}>{b.referralCount}</td>
                        <td className={tdR}>{b.convertedCount}</td>
                        <td className={tdR}>{b.incentive1Count}</td>
                        <td className={tdR}>{inr(b.incentive1Amount)}</td>
                        <td className={tdR}>{b.incentive2Count}</td>
                        <td className={tdR}>{inr(b.incentive2Amount)}</td>
                        <td className={tdR}>{inr(b.revenue)}</td>
                        <td className={tdR}>{inr(b.partsRevenue)}</td>
                        <td className={tdR}>{inr(b.partsMargin)}</td>
                        <td className={tdR}>{inr(b.labourRevenue)}</td>
                        <td className={tdR}>{inr(b.labourMargin)}</td>
                        <td className={tdR}>{inr(b.totalMargin)}</td>
                      </tr>
                    ))}
                    <tr key={`${region}-total`} className="bg-surface-2 font-semibold">
                      <td className="px-3 py-2 text-fg" colSpan={2}>{region} Total</td>
                      <td className={tdR}>{total.referralCount}</td>
                      <td className={tdR}>{total.convertedCount}</td>
                      <td className={tdR}>{total.incentive1Count}</td>
                      <td className={tdR}>{inr(total.incentive1Amount)}</td>
                      <td className={tdR}>{total.incentive2Count}</td>
                      <td className={tdR}>{inr(total.incentive2Amount)}</td>
                      <td className={tdR}>{inr(total.revenue)}</td>
                      <td className={tdR}>{inr(total.partsRevenue)}</td>
                      <td className={tdR}>{inr(total.partsMargin)}</td>
                      <td className={tdR}>{inr(total.labourRevenue)}</td>
                      <td className={tdR}>{inr(total.labourMargin)}</td>
                      <td className={tdR}>{inr(total.totalMargin)}</td>
                    </tr>
                  </Fragment>
                );
              })}
              <tr className="bg-accent-soft font-bold">
                <td className="px-3 py-2 text-fg" colSpan={2}>Group Total</td>
                <td className={tdR}>{summary.grandTotal.referralCount}</td>
                <td className={tdR}>{summary.grandTotal.convertedCount}</td>
                <td className={tdR}>{summary.grandTotal.incentive1Count}</td>
                <td className={tdR}>{inr(summary.grandTotal.incentive1Amount)}</td>
                <td className={tdR}>{summary.grandTotal.incentive2Count}</td>
                <td className={tdR}>{inr(summary.grandTotal.incentive2Amount)}</td>
                <td className={tdR}>{inr(summary.grandTotal.revenue)}</td>
                <td className={tdR}>{inr(summary.grandTotal.partsRevenue)}</td>
                <td className={tdR}>{inr(summary.grandTotal.partsMargin)}</td>
                <td className={tdR}>{inr(summary.grandTotal.labourRevenue)}</td>
                <td className={tdR}>{inr(summary.grandTotal.labourMargin)}</td>
                <td className={tdR}>{inr(summary.grandTotal.totalMargin)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "roi" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className={th}>Region</th>
                <th className={thR}>Total Referral</th>
                <th className={thR}>Converted</th>
                <th className={thR}>Conversion %</th>
                <th className={thR}>Parts Revenue</th>
                <th className={thR}>Labour Revenue</th>
                <th className={thR}>Parts Margin</th>
                <th className={thR}>Labour Margin</th>
                <th className={thR}>Incentive Given</th>
                <th className={thR}>ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roi.map((r) => (
                <tr key={r.region} className={r.region === "Group" ? "bg-accent-soft font-bold" : undefined}>
                  <td className="px-3 py-2 text-fg">{r.region}</td>
                  <td className={tdR}>{r.totalReferral}</td>
                  <td className={tdR}>{r.totalConverted}</td>
                  <td className={tdR}>{(r.conversionPct * 100).toFixed(1)}%</td>
                  <td className={tdR}>{inr(r.partsRevenue)}</td>
                  <td className={tdR}>{inr(r.labourRevenue)}</td>
                  <td className={tdR}>{inr(r.partsMargin)}</td>
                  <td className={tdR}>{inr(r.labourMargin)}</td>
                  <td className={tdR}>{inr(r.incentiveGiven)}</td>
                  <td className={tdR}>{inr(r.roi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "raw" ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">
              {filteredRawRows.length} referral{filteredRawRows.length === 1 ? "" : "s"}
              {rawBranch !== "all" ? ` at ${branchName(rawBranch)} (${rawBranch})` : ""}
            </span>
            {branchOptions.length > 1 ? (
              <select
                value={rawBranch}
                onChange={(e) => {
                  setRawBranch(e.target.value);
                  setRawPage(0);
                }}
                className={`${control} px-2 text-xs`}
              >
                <option value="all">All branches</option>
                {branchOptions.map((b) => (
                  <option key={b} value={b}>
                    {branchName(b)} ({b})
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="max-h-[32rem] overflow-auto rounded-xl border border-border bg-surface shadow-sm">
            <table className="min-w-full">
              <thead className="sticky top-0 z-10 bg-surface-2">
                <tr className="border-b border-border">
                  <th className={thRaw}>Date</th>
                  <th className={thRaw}>Employee</th>
                  <th className={thRaw}>Department</th>
                  <th className={thRaw}>Branch</th>
                  <th className={thRaw}>Vehicle</th>
                  <th className={thRaw}>RO</th>
                  <th className={thRRaw}>Estimate</th>
                  <th className={thRRaw}>Invoiced</th>
                  <th className={thRaw}>Dlr Code</th>
                  <th className={thRaw}>Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedRawRows.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-6 text-center text-sm text-fg-muted">No referrals in this range.</td></tr>
                ) : (
                  pagedRawRows.map((r: GroupReportRow) => (
                    <tr key={r.id}>
                      <td className={`whitespace-nowrap ${tdRaw}`}>{fmtDate(r.submittedAt)}</td>
                      <td className={tdRaw}>{r.employeeName ?? "—"}</td>
                      <td className={tdRaw}>{r.employeeDept ?? "—"}</td>
                      <td className={tdRaw}>{r.employeeBranch ?? "—"}</td>
                      <td className="px-2 py-1.5 font-mono text-xs text-fg">{r.vehicleRegNo ?? "—"}</td>
                      <td className="px-2 py-1.5 font-mono text-xs text-fg">{r.roNo ?? "—"}</td>
                      <td className={tdRRaw}>{r.estimateAmount != null ? inr(r.estimateAmount) : "—"}</td>
                      <td className={tdRRaw}>{r.invoicedAmount != null ? inr(r.invoicedAmount) : "—"}</td>
                      <td className={`whitespace-nowrap ${tdRaw}`}>{r.assignedBranch ? `${branchName(r.assignedBranch)} (${r.assignedBranch})` : "—"}</td>
                      <td className={tdRaw}>{r.remarks ?? ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {rawPageCount > 1 ? (
            <div className="mt-2 flex items-center justify-end gap-2 text-xs text-fg-muted">
              <button
                type="button"
                disabled={clampedPage === 0}
                onClick={() => setRawPage((p) => Math.max(0, p - 1))}
                className="rounded-md border border-border-strong px-2 py-1 font-medium text-fg hover:bg-surface-2 disabled:opacity-40"
              >
                Prev
              </button>
              <span>Page {clampedPage + 1} of {rawPageCount}</span>
              <button
                type="button"
                disabled={clampedPage >= rawPageCount - 1}
                onClick={() => setRawPage((p) => Math.min(rawPageCount - 1, p + 1))}
                className="rounded-md border border-border-strong px-2 py-1 font-medium text-fg hover:bg-surface-2 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
