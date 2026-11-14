import { Fragment } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { adminIdentityLabel } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import { REGIONS, type RegionName } from "@/lib/regions";
import { branchName } from "@/lib/branch-names";
import { control, eyebrow } from "@/lib/ui";
import {
  buildPivot,
  buildRoi,
  buildSummary,
  inclusiveDateRange,
  loadGroupReportRows,
  resolveGroupReportRange,
  type GroupReportRow,
} from "@/lib/bp-referrals/group-report";

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
const td = "px-3 py-2 text-fg-muted";
const tdR = "px-3 py-2 text-right tabular-nums text-fg";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-lg font-bold text-fg">{children}</h2>;
}

/** Month-range picker (2026-11-14, at the user's request — replaces the old
 * raw from/to date inputs, which defaulted to the whole year). Each
 * dropdown's own option values ARE the date the form needs (first-of-month
 * for "From", last-of-month for "To"), so submitting the form still just
 * produces plain ?from=&to= query params — no change needed anywhere else
 * on this page or in the Excel export route. Picking the same month twice
 * views one month (the default); picking Jan + Dec of the same year covers
 * that whole year, same as the "Whole year" links below but one click. */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function monthStart(ym: string): string {
  return `${ym}-01`;
}

function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 0); // day 0 of next month = last day of this month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Trailing `count` months up to and including the current one, oldest
 * first. The currently-selected month is injected too if it falls outside
 * this window (e.g. an old bookmarked link), same defensive pattern as the
 * BPHO analytics view's own month picker. */
function monthOptions(count: number, selected: string): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  if (!months.includes(selected)) months.push(selected);
  return months.sort();
}

export default async function GroupReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "bp_ho" && admin.role !== "hq" && admin.role !== "regional") redirect("/dashboard");

  const params = await searchParams;
  const { from, to } = resolveGroupReportRange(params.from, params.to);
  const branches = admin.role === "regional" ? [...REGIONS[admin.region]] : undefined;
  const navState = await loadNavState(admin);

  const rows = await loadGroupReportRows(inclusiveDateRange(from, to), branches);
  const pivot = buildPivot(rows);
  const summary = buildSummary(rows);
  const roi = buildRoi(summary);
  const regionOrder = Object.keys(REGIONS) as RegionName[];

  const downloadHref = `/api/bp-referrals/group-report?from=${from}&to=${to}`;

  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const fromOpts = monthOptions(24, fromMonth);
  const toOpts = monthOptions(24, toMonth);
  const currentYear = Number(new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }));
  const yearLinks = [currentYear, currentYear - 1, currentYear - 2];

  return (
    <AppShell
      current="bp-referrals"
      showDashboardLink={true}
      isHq={admin.role === "hq"}
      isBpHo={admin.role === "bp_ho"}
      isRegional={admin.role === "regional"}
      centralNav={admin.role === "regional" && admin.region === "Central"}
      regionalRmNav={admin.role === "regional" && admin.region !== "Central"}
      companyTabs={navState.companyTabs}
      canUpload={navState.canUpload}
      slimNav={admin.role === "regional" ? navState.slimNav : undefined}
      dashboardLabel={navState.dashboardLabel}
      queriesBadge={navState.queriesBadge}
      identity={adminIdentityLabel(admin)}
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-fg">Group Report</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Group Accident Vehicle Referral report — {rows.length} referral{rows.length === 1 ? "" : "s"}, {from} to {to}.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <form method="get" className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <span className={eyebrow}>From</span>
                <select name="from" defaultValue={monthStart(fromMonth)} className={`${control} px-2`}>
                  {fromOpts.map((m) => (
                    <option key={m} value={monthStart(m)}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className={eyebrow}>To</span>
                <select name="to" defaultValue={monthEnd(toMonth)} className={`${control} px-2`}>
                  {toOpts.map((m) => (
                    <option key={m} value={monthEnd(m)}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="h-8 rounded-md bg-accent px-3 text-xs font-semibold text-on-accent hover:bg-accent-hover">
                Apply
              </button>
              <a href={downloadHref} className="h-8 rounded-md border border-border-strong px-3 text-xs font-semibold leading-8 text-fg hover:bg-surface-2">
                Download Excel
              </a>
            </form>
            <p className="text-[11px] text-fg-faint">
              Whole year:{" "}
              {yearLinks.map((y, i) => (
                <span key={y}>
                  {i > 0 ? " · " : ""}
                  <a href={`?from=${y}-01-01&to=${y}-12-31`} className="text-accent hover:underline">
                    {y}
                  </a>
                </span>
              ))}
            </p>
          </div>
        </div>

        {/* ---- Pivot ---- */}
        <div className="mb-8">
          <SectionHeading>Branch Pivot</SectionHeading>
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
        </div>

        {/* ---- Summary ---- */}
        <div className="mb-8">
          <SectionHeading>Summary — Region / Branch</SectionHeading>
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
        </div>

        {/* ---- ROI ---- */}
        <div className="mb-8">
          <SectionHeading>ROI — Region / Group</SectionHeading>
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
        </div>

        {/* ---- Raw log ---- */}
        <div>
          <SectionHeading>Raw Log</SectionHeading>
          <div className="max-h-[32rem] overflow-auto rounded-xl border border-border bg-surface shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-2">
                <tr className="border-b border-border">
                  <th className={th}>Date</th>
                  <th className={th}>Employee</th>
                  <th className={th}>Department</th>
                  <th className={th}>Branch</th>
                  <th className={th}>Vehicle</th>
                  <th className={th}>RO</th>
                  <th className={thR}>Estimate</th>
                  <th className={thR}>Invoiced</th>
                  <th className={th}>Dlr Code</th>
                  <th className={th}>Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-6 text-center text-sm text-fg-muted">No referrals in this range.</td></tr>
                ) : (
                  rows.map((r: GroupReportRow) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-fg-muted">{fmtDate(r.submittedAt)}</td>
                      <td className={td}>{r.employeeName ?? "—"}</td>
                      <td className={td}>{r.employeeDept ?? "—"}</td>
                      <td className={td}>{r.employeeBranch ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-fg">{r.vehicleRegNo ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-fg">{r.roNo ?? "—"}</td>
                      <td className={tdR}>{r.estimateAmount != null ? inr(r.estimateAmount) : "—"}</td>
                      <td className={tdR}>{r.invoicedAmount != null ? inr(r.invoicedAmount) : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-fg-muted">{r.assignedBranch ? `${branchName(r.assignedBranch)} (${r.assignedBranch})` : "—"}</td>
                      <td className="px-3 py-2 text-fg-muted">{r.remarks ?? ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
