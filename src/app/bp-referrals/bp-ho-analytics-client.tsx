"use client";

import { useActionState, useMemo, useState } from "react";
import { control, eyebrow } from "@/lib/ui";
import { branchName } from "@/lib/branch-names";
import type { BpmQueueReferral } from "./bpm-queue-client";
import type { PayoutLedgerRow, BranchRollupRow, StaleReferralRow } from "@/lib/bp-referrals/store";
import { assignBranchAction, rescanUnmatchedReferralsAction, type BpHoActionState, type RescanState } from "./bp-ho-actions";

function fmt(ts: Date | string | null): string {
  if (!ts) return "—";
  const d = new Date(ts as string);
  if (isNaN(d.getTime())) return String(ts).slice(0, 16);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

type Status = "pending" | "not_connected" | "followup" | "completed" | "not_genuine" | "not_interested";

function classify(r: BpmQueueReferral): Status {
  if (r.ro_matched_at) return "completed";
  if (r.closed_reason === "not_genuine") return "not_genuine";
  if (r.closed_reason === "not_interested") return "not_interested";
  if (r.validated_at) return "followup";
  if (r.call_status === "not_connected") return "not_connected";
  return "pending";
}

const STATUS_LABEL: Record<Status, string> = {
  pending: "To call",
  not_connected: "Not connected",
  followup: "Validated — follow up",
  completed: "Completed",
  not_genuine: "Not genuine",
  not_interested: "Not interested",
};
const STATUS_CLASS: Record<Status, string> = {
  pending: "bg-accent-soft text-accent-text",
  not_connected: "bg-accent-soft text-accent-text",
  followup: "bg-warn-soft text-warn-text",
  completed: "bg-good-soft text-good-text",
  not_genuine: "bg-surface-2 text-fg-faint",
  not_interested: "bg-surface-2 text-fg-faint",
};

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className={eyebrow}>{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums text-fg">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-fg-faint">{sub}</div> : null}
    </div>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Vehicle photo" className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-xl" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo"
          className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white text-gray-800 shadow-md hover:bg-gray-100"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const ASSIGN_INIT: BpHoActionState = { error: null, ok: false };

function AssignBranchForm({ referralId, branchCodes }: { referralId: number; branchCodes: string[] }) {
  const [state, action, pending] = useActionState(assignBranchAction, ASSIGN_INIT);
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={referralId} />
      <select name="branch" required defaultValue="" className={`${control} h-7 px-1.5 text-xs`}>
        <option value="" disabled>
          Assign branch…
        </option>
        {branchCodes.map((b) => (
          <option key={b} value={b}>
            {branchName(b)} ({b})
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="h-7 rounded-md bg-accent px-2 text-xs font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "…" : "Set"}
      </button>
      {state.error ? <span className="text-xs text-bad">{state.error}</span> : null}
    </form>
  );
}

const RESCAN_INIT: RescanState = { error: null, matchedCount: null };

function RescanButton() {
  const [state, action, pending] = useActionState(rescanUnmatchedReferralsAction, RESCAN_INIT);
  return (
    <div className="flex items-center gap-2">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2 disabled:opacity-60"
        >
          {pending ? "Re-scanning…" : "Re-scan for RO matches"}
        </button>
      </form>
      {state.matchedCount !== null ? (
        <span className="text-xs text-fg-muted">
          {state.matchedCount === 0 ? "No new matches found." : `Matched ${state.matchedCount} referral${state.matchedCount === 1 ? "" : "s"}.`}
        </span>
      ) : null}
      {state.error ? <span className="text-xs text-bad">{state.error}</span> : null}
    </div>
  );
}

function daysAgo(ts: Date | string | null): number {
  if (!ts) return 0;
  const then = new Date(ts as string).getTime();
  if (isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

export function BpHoAnalyticsClient({
  referrals,
  payoutLedger,
  branchRollup,
  staleReferrals,
  branchCodes: allBranchCodes,
}: {
  referrals: BpmQueueReferral[];
  payoutLedger: PayoutLedgerRow[];
  branchRollup: BranchRollupRow[];
  staleReferrals: StaleReferralRow[];
  branchCodes: string[];
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const filterBranchCodes = useMemo(
    () => [...new Set(referrals.map((r) => r.assigned_branch).filter((b): b is string => !!b))].sort(),
    [referrals],
  );

  const kpis = useMemo(() => {
    const counts: Record<Status, number> = { pending: 0, not_connected: 0, followup: 0, completed: 0, not_genuine: 0, not_interested: 0 };
    for (const r of referrals) counts[classify(r)]++;
    const validated = referrals.filter((r) => r.validated_at).length;
    const totalOwed = payoutLedger.reduce((sum, r) => sum + r.amountOwed, 0);
    return { total: referrals.length, counts, validated, totalOwed };
  }, [referrals, payoutLedger]);

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {lightboxUrl ? <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} /> : null}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg">BP Referrals</h1>
        <p className="mt-1 text-sm text-fg-muted">Company-wide Body &amp; Paint referral analytics — {kpis.total} total referrals.</p>
      </div>

      {/* KPI strip */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Total" value={String(kpis.total)} />
        <StatTile label="To call" value={String(kpis.counts.pending)} />
        <StatTile label="Not connected" value={String(kpis.counts.not_connected)} />
        <StatTile label="Follow-up" value={String(kpis.counts.followup)} sub={`${kpis.validated} validated`} />
        <StatTile label="Completed" value={String(kpis.counts.completed)} />
        <StatTile label="Not genuine / interested" value={String(kpis.counts.not_genuine + kpis.counts.not_interested)} />
      </div>

      {/* Needs attention — stale referrals (no contact 3+ days after submission) and the RO re-scan backstop */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-fg">Needs attention</h2>
          <RescanButton />
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Employee</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Branch</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Status</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Days waiting</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {staleReferrals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-fg-muted">
                    Nothing stuck — every referral has had at least a first call attempt within 3 days.
                  </td>
                </tr>
              ) : (
                staleReferrals.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-medium text-fg">{r.referringEmployeeName ?? "—"}</td>
                    <td className="px-3 py-2 text-fg-muted">
                      {r.assignedBranch ? `${branchName(r.assignedBranch)} (${r.assignedBranch})` : "Unassigned"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-medium text-bad-text">
                        {r.callStatus === "not_connected" ? "Not connected" : "Never attempted"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-bad">{r.daysSinceSubmitted}</td>
                    <td className="px-3 py-2">
                      {!r.assignedBranch ? <AssignBranchForm referralId={r.id} branchCodes={allBranchCodes} /> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payout ledger */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-fg">Payout ledger</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-fg">Total owed: {inr(kpis.totalOwed)}</span>
            <a
              href="/api/bp-referrals/payout-export"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover"
            >
              Export CSV
            </a>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Employee</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Branch</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Validated (₹50)</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Completed (₹200)</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payoutLedger.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-fg-muted">
                    No payouts yet.
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Branch / region rollup */}
      <div className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-fg">Branch breakdown</h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
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
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {branchRollup.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-sm text-fg-muted">
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
        <h2 className="mb-3 text-lg font-bold text-fg">All referrals</h2>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className={eyebrow}>From</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={`${control} px-2`} />
          </div>
          <div className="flex flex-col gap-1">
            <span className={eyebrow}>To</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={`${control} px-2`} />
          </div>
          <div className="flex flex-col gap-1">
            <span className={eyebrow}>Branch</span>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={`${control} px-2`}>
              <option value="">All branches</option>
              {filterBranchCodes.map((b) => (
                <option key={b} value={b}>
                  {branchName(b)} ({b})
                </option>
              ))}
            </select>
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setBranchFilter("");
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

        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Submitted</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Employee</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Branch</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Reg No</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Status</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Estimate</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Payment</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Matched RO</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Photo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-fg-muted">
                    {hasFilters ? "No referrals match the current filters." : "No referrals yet."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const status = classify(r);
                  return (
                    <tr key={r.id} className="hover:bg-surface-2/50">
                      <td className="whitespace-nowrap px-3 py-2.5 text-fg-muted">{fmt(r.submitted_at)}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-fg">{r.referring_employee_name ?? "—"}</div>
                        <div className="text-xs text-fg-faint">
                          {r.referring_employee_id ? `ID: ${r.referring_employee_id}` : null}
                          {r.referring_employee_branch ? ` · ${r.referring_employee_branch}` : ""}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-fg-muted">
                        {r.assigned_branch ? (
                          <>
                            {branchName(r.assigned_branch)} ({r.assigned_branch})
                            {r.transferred_from ? <div className="text-xs text-fg-faint">from {branchName(r.transferred_from)}</div> : null}
                          </>
                        ) : (
                          <AssignBranchForm referralId={r.id} branchCodes={allBranchCodes} />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-fg">{r.vehicle_reg_no ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-fg">
                        {r.estimate_amount != null ? inr(Number(r.estimate_amount)) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-fg-muted">
                        {r.payment_type === "CP" ? "Customer paid" : r.payment_type === "IP" ? "Insurance paid" : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-fg">{r.matched_ro_no ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        {r.vehicle_image_url ? (
                          <button
                            type="button"
                            onClick={() => setLightboxUrl(`/api/bp-referrals/photo/${r.id}`)}
                            className="group relative h-12 w-16 overflow-hidden rounded border border-border hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            aria-label="View vehicle photo"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/bp-referrals/photo/${r.id}`}
                              alt="Vehicle"
                              className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                            />
                          </button>
                        ) : (
                          <span className="flex h-12 w-16 items-center justify-center rounded border border-border bg-surface-2 text-[10px] text-fg-faint">
                            No photo
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
