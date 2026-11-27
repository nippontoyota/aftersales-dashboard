"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { control, eyebrow } from "@/lib/ui";
import type { BpmQueueReferral } from "./bpm-queue-client";
import type { PayoutLedgerRow, PayoutHistoryRow, BranchRollupRow } from "@/lib/bp-referrals/store";
import { AssignBranchForm, MarkPaidButton, RescanButton } from "./bp-ho-controls";
import {
  classify,
  fmt,
  inr,
  KpiCard,
  KpiModal,
  Lightbox,
  ReferralTable,
  SlideOverFilters,
  TotalIcon,
  PhoneIcon,
  PhoneOffIcon,
  ClockIcon,
  AlarmIcon,
  CheckCircleIcon,
  CarIcon,
  WrenchIcon,
  XCircleIcon,
  DashCircleIcon,
  WalletIcon,
  BranchIcon,
  ListIcon,
} from "./kpi-shared";
import { branchName } from "@/lib/branch-names";

type Status = ReturnType<typeof classify>;

function monthLabel(month: string): string {
  if (month === "all") return "All time";
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** Last 12 months plus "All time" — the currently-selected month is always
 * included even if it falls outside that window (e.g. an old ?month= link),
 * so the <select> never silently shows the wrong value. */
function monthOptions(selected: string): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [{ value: "all", label: "All time" }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value, label: monthLabel(value) });
  }
  if (!opts.some((o) => o.value === selected)) opts.push({ value: selected, label: monthLabel(selected) });
  return opts;
}

/** Scopes the whole analytics view below (KPIs, branch breakdown, the
 * referral list) to one month instead of all time (2026-11-09, the user's
 * request) — just navigates to ?month=, which page.tsx re-reads server-side.
 * Needs attention and the Payout ledger/history are unaffected on purpose
 * (see BpHoAnalyticsClient's own doc comments). */
function MonthPicker({ month }: { month: string }) {
  const router = useRouter();
  const opts = useMemo(() => monthOptions(month), [month]);
  return (
    <select
      value={month}
      onChange={(e) => router.push(`/bp-referrals?month=${e.target.value}`)}
      className={`${control} px-2`}
    >
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Date-range download of the multi-sheet "Group Accident Vehicle Referral"
 * Excel report BP HO asked for (2026-11-09) — a plain GET form (no JS
 * needed beyond the date defaults) straight to the API route, which does
 * its own auth/branch scoping. Defaults to the current calendar year to
 * date, matching how BP HO's own reference sheet was named by year. */
function GroupReportExport() {
  const today = new Date();
  const [from, setFrom] = useState(`${today.getFullYear()}-01-01`);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  return (
    <form action="/api/bp-referrals/group-report" method="get" className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <span className={eyebrow}>From</span>
        <input type="date" name="from" value={from} onChange={(e) => setFrom(e.target.value)} className={`${control} px-2`} />
      </div>
      <div className="flex flex-col gap-1">
        <span className={eyebrow}>To</span>
        <input type="date" name="to" value={to} onChange={(e) => setTo(e.target.value)} className={`${control} px-2`} />
      </div>
      <button type="submit" className="h-8 shrink-0 rounded-md bg-accent px-3 text-xs font-semibold text-on-accent hover:bg-accent-hover">
        Export Group Report
      </button>
    </form>
  );
}

export function BpHoAnalyticsClient({
  referrals,
  liveReferrals,
  payoutLedger,
  payoutHistory = [],
  branchRollup,
  branchCodes: allBranchCodes,
  canRescan = true,
  month,
}: {
  referrals: BpmQueueReferral[];
  /** Unscoped by month — Needs attention (overdue/dropped) always reads
   * from this instead of `referrals`, since "what needs calling right now"
   * shouldn't disappear just because the referral was submitted last month.
   * Falls back to `referrals` if omitted. */
  liveReferrals?: BpmQueueReferral[];
  payoutLedger: PayoutLedgerRow[];
  /** Settled payout records — omitted for a regional manager's own scoped
   * view, same gate as canRescan (see below). */
  payoutHistory?: PayoutHistoryRow[];
  branchRollup: BranchRollupRow[];
  branchCodes: string[];
  /** Hides the "Re-check pending RO entries" button AND the Payout ledger's
   * "Mark paid" action / Payment history section — all company-wide,
   * write/admin actions BP HO gets but a regional manager's own scoped view
   * doesn't (2026-10-29 / 2026-11-06, the user's call). Defaults to true
   * (BP HO/HQ). */
  canRescan?: boolean;
  /** "YYYY-MM" or "all" — which month `referrals`/`branchRollup` are scoped
   * to (set server-side in page.tsx from ?month=). */
  month: string;
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [activeSlideOver, setActiveSlideOver] = useState<{ title: string; predicate: (r: BpmQueueReferral) => boolean } | null>(null);
  // "All referrals" pagination (2026-11-16, at the user's request — this
  // list used to render every matching referral at once, the single
  // biggest driver of page-level scroll here since every other section
  // already has its own capped-height scroll box). Page resets whenever
  // the filters below change it out from under the current page.
  const [allReferralsPage, setAllReferralsPage] = useState(0);

  const filterBranchCodes = useMemo(
    () => [...new Set(referrals.map((r) => r.assigned_branch).filter((b): b is string => !!b))].sort(),
    [referrals],
  );

  const classified = useMemo(() => referrals.map((r) => ({ r, status: classify(r) })), [referrals]);

  const kpis = useMemo(() => {
    const counts: Record<Status, number> = {
      pending: 0,
      not_connected: 0,
      followup: 0,
      followup_overdue: 0,
      vehicle_received: 0,
      repair_in_progress: 0,
      completed: 0,
      not_genuine: 0,
      not_interested: 0,
      lost: 0,
      self_arrived: 0,
      dropped: 0,
    };
    for (const { status } of classified) counts[status]++;
    const totalOwed = payoutLedger.reduce((sum, r) => sum + r.amountOwed, 0);
    return { total: referrals.length, counts, totalOwed };
  }, [classified, referrals.length, payoutLedger]);

  const classifiedLive = useMemo(() => (liveReferrals ?? referrals).map((r) => ({ r, status: classify(r) })), [liveReferrals, referrals]);
  const overdueFollowUps = useMemo(() => classifiedLive.filter((c) => c.status === "followup_overdue").map((c) => c.r), [classifiedLive]);
  const dropped = useMemo(() => classifiedLive.filter((c) => c.status === "dropped").map((c) => c.r), [classifiedLive]);

  const filtered = useMemo(() => {
    return referrals.filter((r) => {
      if (branchFilter && r.assigned_branch !== branchFilter) return false;
      if (fromDate && r.submitted_at) {
        const day = (r.submitted_at instanceof Date ? r.submitted_at.toISOString() : String(r.submitted_at)).slice(0, 10);
        if (day < fromDate) return false;
      }
      if (toDate && r.submitted_at) {
        const day = (r.submitted_at instanceof Date ? r.submitted_at.toISOString() : String(r.submitted_at)).slice(0, 10);
        if (day > toDate) return false;
      }
      return true;
    });
  }, [referrals, fromDate, toDate, branchFilter]);

  const hasFilters = fromDate || toDate || branchFilter;

  // Clamped rather than reset via an effect — if a filter change shrinks
  // the result set, this alone keeps the visible page in range; if it
  // later grows again, the viewer just lands back on whatever page they
  // were on before, which only matters if they're deliberately paging
  // while adjusting filters (rare, and harmless either way).
  const ALL_REFERRALS_PAGE_SIZE = 50;
  const allReferralsPageCount = Math.max(1, Math.ceil(filtered.length / ALL_REFERRALS_PAGE_SIZE));
  const clampedAllReferralsPage = Math.min(allReferralsPage, allReferralsPageCount - 1);
  const pagedReferrals = filtered.slice(
    clampedAllReferralsPage * ALL_REFERRALS_PAGE_SIZE,
    (clampedAllReferralsPage + 1) * ALL_REFERRALS_PAGE_SIZE,
  );

  const openKpi = (title: string, predicate: (r: BpmQueueReferral) => boolean) => setActiveSlideOver({ title, predicate });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {lightboxUrl ? <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} /> : null}
      {activeSlideOver ? (
        <KpiModal
          title={activeSlideOver.title}
          rows={referrals.filter(activeSlideOver.predicate)}
          branchCodes={allBranchCodes}
          onClose={() => setActiveSlideOver(null)}
          onPhotoClick={(id) => setLightboxUrl(`/api/bp-referrals/photo/${id}`)}
        />
      ) : null}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">BP Referrals</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Company-wide Body &amp; Paint referral analytics — {monthLabel(month)} — {kpis.total} referral{kpis.total === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <span className={eyebrow}>Month</span>
          <MonthPicker month={month} />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-surface-2/50 px-4 py-3">
        <div>
          <div className={eyebrow}>Group report</div>
          <p className="text-xs text-fg-muted">Raw log, Pivot, Summary, ROI for a date range — the old tracker, generated from live data.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <a href="/bp-referrals/group-report" className="h-8 rounded-md border border-border-strong px-3 text-xs font-semibold leading-8 text-fg hover:bg-surface-2">
            View Report
          </a>
          <GroupReportExport />
        </div>
      </div>

      {/* KPI strip — click a card to see the matching cases */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <KpiCard icon={<TotalIcon />} color="neutral" label="Total" value={kpis.total} onClick={() => openKpi("All referrals", () => true)} />
        <KpiCard
          icon={<PhoneIcon />}
          color="accent"
          label="To call"
          value={kpis.counts.pending}
          onClick={() => openKpi("To call", (r) => classify(r) === "pending")}
        />
        <KpiCard
          icon={<PhoneOffIcon />}
          color="accent"
          label="Not connected"
          value={kpis.counts.not_connected}
          onClick={() => openKpi("Not connected", (r) => classify(r) === "not_connected")}
        />
        <KpiCard
          icon={<ClockIcon />}
          color="warn"
          label="Follow-up"
          value={kpis.counts.followup + kpis.counts.followup_overdue}
          sub={kpis.counts.followup_overdue > 0 ? `${kpis.counts.followup_overdue} overdue` : undefined}
          onClick={() => openKpi("Follow-up", (r) => { const s = classify(r); return s === "followup" || s === "followup_overdue"; })}
        />
        <KpiCard
          icon={<CarIcon />}
          color="info"
          label="Vehicle received"
          value={kpis.counts.vehicle_received}
          onClick={() => openKpi("Vehicle received", (r) => classify(r) === "vehicle_received")}
        />
        <KpiCard
          icon={<WrenchIcon />}
          color="accent"
          label="Repair in progress"
          value={kpis.counts.repair_in_progress}
          onClick={() => openKpi("Repair in progress", (r) => classify(r) === "repair_in_progress")}
        />
        <KpiCard
          icon={<CheckCircleIcon />}
          color="good"
          label="Completed"
          value={kpis.counts.completed}
          onClick={() => openKpi("Completed", (r) => classify(r) === "completed")}
        />
        <KpiCard
          icon={<XCircleIcon />}
          color="bad"
          label="Dropped"
          value={kpis.counts.dropped}
          onClick={() => openKpi("Dropped", (r) => classify(r) === "dropped")}
        />
        <KpiCard
          icon={<DashCircleIcon />}
          color="bad"
          label="Not genuine"
          sub="₹0 payout"
          value={kpis.counts.not_genuine}
          onClick={() => openKpi("Not genuine", (r) => classify(r) === "not_genuine")}
        />
        <KpiCard
          icon={<DashCircleIcon />}
          color="neutral"
          label="Not interested"
          sub="still ₹50"
          value={kpis.counts.not_interested}
          onClick={() => openKpi("Not interested", (r) => classify(r) === "not_interested")}
        />
        <KpiCard
          icon={<XCircleIcon />}
          color="bad"
          label="Lost"
          sub="still ₹50"
          value={kpis.counts.lost}
          onClick={() => openKpi("Lost", (r) => classify(r) === "lost")}
        />
        <KpiCard
          icon={<DashCircleIcon />}
          color="bad"
          label="Self arrived"
          sub="₹0 payout"
          value={kpis.counts.self_arrived}
          onClick={() => openKpi("Self arrived", (r) => classify(r) === "self_arrived")}
        />
      </div>

      {/* Needs attention */}
      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-bad/30 bg-surface shadow-sm">
          <div className="flex items-center gap-2 border-b border-bad/20 bg-bad-soft/40 px-4 py-2.5">
            <AlarmIcon />
            <h2 className="text-sm font-bold text-bad">Follow-ups overdue (24h+)</h2>
            <span className="text-xs font-normal text-fg-faint">(live, not month-scoped)</span>
            <span className="ml-auto text-xs font-semibold text-bad">{overdueFollowUps.length}</span>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {overdueFollowUps.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-fg-muted">Nothing overdue.</p>
            ) : (
              overdueFollowUps.map((r) => (
                <div key={r.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-fg">{r.referring_employee_name ?? "—"}</span>
                    <span className="font-mono text-xs text-fg-faint">{r.vehicle_reg_no ?? "—"}</span>
                  </div>
                  <div className="text-xs text-fg-faint">
                    {r.assigned_branch ? `${branchName(r.assigned_branch)} (${r.assigned_branch})` : "Unassigned"} · last contact {fmt(r.last_contacted_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-bad/30 bg-surface shadow-sm">
          <div className="flex items-center gap-2 border-b border-bad/20 bg-bad-soft/40 px-4 py-2.5">
            <XCircleIcon />
            <h2 className="text-sm font-bold text-bad">Dropped (no contact in 3+ days)</h2>
            <span className="text-xs font-normal text-fg-faint">(live, not month-scoped)</span>
            <span className="ml-auto text-xs font-semibold text-bad">{dropped.length}</span>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {dropped.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-fg-muted">Nothing dropped.</p>
            ) : (
              dropped.map((r) => (
                <div key={r.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-fg">{r.referring_employee_name ?? "—"}</span>
                    <span className="font-mono text-xs text-fg-faint">{r.vehicle_reg_no ?? "—"}</span>
                  </div>
                  <div className="text-xs text-fg-faint">
                    {r.assigned_branch ? (
                      `${branchName(r.assigned_branch)} (${r.assigned_branch})`
                    ) : (
                      <AssignBranchForm referralId={r.id} branchCodes={allBranchCodes} />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Payout ledger */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-fg">
            <WalletIcon /> Payout ledger <span className="text-xs font-normal text-fg-faint">(all-time balance, not month-scoped)</span>
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-fg">Total owed: {inr(kpis.totalOwed)}</span>
            <a
              href="/api/bp-referrals/payout-export"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover"
            >
              Export CSV
            </a>
            {canRescan ? <RescanButton /> : null}
          </div>
        </div>
        {/* Fixed-height scroll instead of letting this table grow the page
         * forever (2026-11-06, at the user's request) — it used to list
         * every employee who ever had a validated referral, with no way to
         * settle one; see loadPayoutLedger's doc comment for the real fix
         * (the "Mark paid" column below), this is just the visual cap. */}
        <div className="max-h-96 overflow-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface-2">
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Employee</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Branch</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Validated (₹50)</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Completed (₹200)</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Owed</th>
                {canRescan ? <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">&nbsp;</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payoutLedger.length === 0 ? (
                <tr>
                  <td colSpan={canRescan ? 6 : 5} className="px-3 py-6 text-center text-sm text-fg-muted">
                    Nothing outstanding.
                  </td>
                </tr>
              ) : (
                payoutLedger.map((row, i) => (
                  <tr key={`${row.employeeId}-${i}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-fg">{row.employeeName ?? "—"}</div>
                      {row.employeeId ? <div className="text-xs text-fg-faint">ID: {row.employeeId}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-fg-muted">{row.employeeBranch || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-fg">{row.validatedCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-fg">{row.completedCount}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-fg">{inr(row.amountOwed)}</td>
                    {canRescan ? (
                      <td className="px-3 py-2 text-right">
                        <MarkPaidButton
                          employeeId={row.employeeId}
                          employeeName={row.employeeName}
                          employeeBranch={row.employeeBranch}
                          amount={row.amountOwed}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment history — the settled side of the ledger above; BP HO/HQ
       * only, same gate as the "Mark paid" action itself. */}
      {canRescan ? (
        <div className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-fg">
            <WalletIcon /> Payment history <span className="text-xs font-normal text-fg-faint">(all-time)</span>
          </h2>
          <div className="max-h-72 overflow-auto rounded-xl border border-border bg-surface shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-2">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Employee</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Branch</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Amount</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Paid</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payoutHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-fg-muted">
                      No payments recorded yet.
                    </td>
                  </tr>
                ) : (
                  payoutHistory.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-fg">{row.employeeName || "—"}</div>
                        {row.employeeId ? <div className="text-xs text-fg-faint">ID: {row.employeeId}</div> : null}
                      </td>
                      <td className="px-3 py-2 text-fg-muted">{row.employeeBranch || "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-fg">{inr(row.amount)}</td>
                      <td className="px-3 py-2 text-fg-muted">{fmt(row.paidAt)}</td>
                      <td className="px-3 py-2 text-fg-muted">{row.paidBy || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Branch / region rollup */}
      <div className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-fg">
          <BranchIcon /> Branch breakdown
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Branch</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Region</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Total</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Validated</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Completed</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Not genuine</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Not interested</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Lost</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {branchRollup.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-sm text-fg-muted">
                    No referrals yet.
                  </td>
                </tr>
              ) : (
                branchRollup.map((row) => (
                  <tr key={row.branch}>
                    <td className="px-3 py-2 font-medium text-fg">{branchName(row.branch)} ({row.branch})</td>
                    <td className="px-3 py-2 text-fg-muted">{row.region ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-fg">{row.total}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-fg">{row.validated}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-fg">{row.completed}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{row.notGenuine}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{row.notInterested}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{row.lost}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{row.pending}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full referral list */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-fg">
          <ListIcon /> All referrals
        </h2>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <SlideOverFilters
            fromDate={fromDate}
            toDate={toDate}
            branchFilter={branchFilter}
            setFromDate={(v) => { setFromDate(v); setAllReferralsPage(0); }}
            setToDate={(v) => { setToDate(v); setAllReferralsPage(0); }}
            setBranchFilter={(v) => { setBranchFilter(v); setAllReferralsPage(0); }}
            branchCodes={filterBranchCodes}
          />
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setBranchFilter("");
                setAllReferralsPage(0);
              }}
              className="h-8 rounded-md px-3 text-sm text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Clear
            </button>
          ) : null}
          <span className="ml-auto text-sm text-fg-muted">
            {filtered.length} {filtered.length === 1 ? "referral" : "referrals"}
            {hasFilters ? " (filtered)" : ""}
          </span>
        </div>

        <ReferralTable rows={pagedReferrals} onPhotoClick={(id) => setLightboxUrl(`/api/bp-referrals/photo/${id}`)} allBranchCodes={allBranchCodes} />

        {allReferralsPageCount > 1 ? (
          <div className="mt-2 flex items-center justify-end gap-2 text-xs text-fg-muted">
            <button
              type="button"
              disabled={clampedAllReferralsPage === 0}
              onClick={() => setAllReferralsPage((p) => Math.max(0, p - 1))}
              className="rounded-md border border-border-strong px-2 py-1 font-medium text-fg hover:bg-surface-2 disabled:opacity-40"
            >
              Prev
            </button>
            <span>Page {clampedAllReferralsPage + 1} of {allReferralsPageCount}</span>
            <button
              type="button"
              disabled={clampedAllReferralsPage >= allReferralsPageCount - 1}
              onClick={() => setAllReferralsPage((p) => Math.min(allReferralsPageCount - 1, p + 1))}
              className="rounded-md border border-border-strong px-2 py-1 font-medium text-fg hover:bg-surface-2 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
