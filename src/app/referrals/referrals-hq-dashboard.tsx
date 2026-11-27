"use client";

import { useMemo, useState } from "react";
import { branchName } from "@/lib/branch-names";
import type { BranchRollupRow, InactiveReferralRow, PayoutHistoryRow, PayoutLedgerRow } from "@/lib/inactive-referrals/store";
import { classify, DetailModal, fmt, fmtDate, StatusBadge, type Stage } from "./referrals-queue-client";
import { MarkPaidButton, RescanButton } from "./hq-controls";

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function iconBase(children: React.ReactNode) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]" aria-hidden="true">
      {children}
    </svg>
  );
}
const TotalIcon = () => iconBase(<><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" /><rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></>);
const PhoneIcon = () => iconBase(<path d="M5 3h3l1.5 4-2 1.5a9 9 0 0 0 4 4l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A14 14 0 0 1 3.5 4.6 1.5 1.5 0 0 1 5 3z" strokeLinecap="round" strokeLinejoin="round" />);
const PhoneOffIcon = () => iconBase(<><path d="M5 3h3l1.5 4-2 1.5a9 9 0 0 0 4 4l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A14 14 0 0 1 3.5 4.6 1.5 1.5 0 0 1 5 3z" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 3l14 14" strokeLinecap="round" /></>);
const CheckIcon = () => iconBase(<><circle cx="10" cy="10" r="7" /><path d="M7 10l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></>);
const CalendarIcon = () => iconBase(<><rect x="3.5" y="4.5" width="13" height="12" rx="1.5" /><path d="M3.5 8.5h13M7 3v3M13 3v3" strokeLinecap="round" /></>);
const AlarmIcon = () => iconBase(<><circle cx="10" cy="11" r="6.5" /><path d="M10 8v3l2 1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 4.5 4 6.5M14 4.5l2 2" strokeLinecap="round" /></>);
const WrenchIcon = () => iconBase(<path d="M13.5 4a3.5 3.5 0 0 0-4.6 3.9L4 12.8V16h3.2l4.9-4.9a3.5 3.5 0 0 0 3.9-4.6l-2.3 2.3-1.8-.6-.6-1.8L13.5 4z" strokeLinecap="round" strokeLinejoin="round" />);
const XCircleIcon = () => iconBase(<><circle cx="10" cy="10" r="7" /><path d="M7.5 7.5l5 5M12.5 7.5l-5 5" strokeLinecap="round" /></>);
const WalletIcon = () => iconBase(<><rect x="3" y="5.5" width="14" height="10" rx="1.5" /><path d="M3 8.5h14" /><circle cx="14" cy="11.5" r="1" fill="currentColor" stroke="none" /></>);
const BranchIcon = () => iconBase(<><path d="M5 3v6a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V8" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 12v5" strokeLinecap="round" /><circle cx="5" cy="3" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="10" cy="17" r="1.4" /></>);
const ListIcon = () => iconBase(<><path d="M7 5h10M7 10h10M7 15h10" strokeLinecap="round" /><circle cx="3.5" cy="5" r="0.9" fill="currentColor" stroke="none" /><circle cx="3.5" cy="10" r="0.9" fill="currentColor" stroke="none" /><circle cx="3.5" cy="15" r="0.9" fill="currentColor" stroke="none" /></>);
const ChevronRightIcon = () => iconBase(<path d="M7.5 4.5L13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />);

type AccentColor = "neutral" | "accent" | "info" | "warn" | "bad" | "good";
const ACCENT: Record<AccentColor, { edge: string; chip: string }> = {
  neutral: { edge: "bg-fg-faint", chip: "bg-surface-2 text-fg-muted" },
  accent: { edge: "bg-accent", chip: "bg-accent-soft text-accent-text" },
  info: { edge: "bg-info-solid", chip: "bg-info-soft text-info" },
  warn: { edge: "bg-warn-solid", chip: "bg-warn-soft text-warn-text" },
  bad: { edge: "bg-bad-solid", chip: "bg-bad-soft text-bad" },
  good: { edge: "bg-good-solid", chip: "bg-good-soft text-good-text" },
};

function KpiCard({ icon, color, label, value, onClick }: { icon: React.ReactNode; color: AccentColor; label: string; value: number; onClick: () => void }) {
  const accent = ACCENT[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col items-start overflow-hidden rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className={`absolute inset-x-0 top-0 h-0.5 ${accent.edge}`} aria-hidden="true" />
      <div className="flex w-full items-start justify-between">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent.chip}`}>{icon}</div>
        <ChevronRightIcon />
      </div>
      <div className="mt-2.5 text-2xl font-bold tabular-nums text-fg">{value}</div>
      <div className="text-[11px] font-medium text-fg-subtle">{label}</div>
    </button>
  );
}

export function ReferralsHqDashboard({
  referrals,
  payoutLedger,
  payoutHistory,
  branchRollup,
}: {
  referrals: InactiveReferralRow[];
  payoutLedger: PayoutLedgerRow[];
  payoutHistory: PayoutHistoryRow[];
  branchRollup: BranchRollupRow[];
}) {
  const [activeStage, setActiveStage] = useState<Stage | null>(null);
  const [selected, setSelected] = useState<InactiveReferralRow | null>(null);

  const classified = useMemo(() => referrals.map((r) => ({ r, stage: classify(r) })), [referrals]);
  const counts = useMemo(() => {
    const c: Record<Stage, number> = {
      to_call: 0, not_connected: 0, connected: 0, appointment_set: 0, no_show: 0, ro_entered: 0, not_verified: 0, verified: 0, closed: 0,
    };
    for (const { stage } of classified) c[stage]++;
    return c;
  }, [classified]);
  const totalOwed = useMemo(() => payoutLedger.reduce((sum, r) => sum + r.amountOwed, 0), [payoutLedger]);

  const visible = activeStage ? referrals.filter((r) => classify(r) === activeStage) : referrals;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {selected ? <DetailModal referral={selected} ownBranch="" readOnly={true} onClose={() => setSelected(null)} /> : null}

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg">3C Referrals</h1>
        <p className="mt-1 text-sm text-fg-muted">Company-wide inactive-customer re-engagement — {referrals.length} referral{referrals.length === 1 ? "" : "s"}.</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-9">
        <KpiCard icon={<TotalIcon />} color="neutral" label="Total" value={referrals.length} onClick={() => setActiveStage(null)} />
        <KpiCard icon={<PhoneIcon />} color="accent" label="To call" value={counts.to_call} onClick={() => setActiveStage("to_call")} />
        <KpiCard icon={<PhoneOffIcon />} color="warn" label="Not connected" value={counts.not_connected} onClick={() => setActiveStage("not_connected")} />
        <KpiCard icon={<CheckIcon />} color="accent" label="Connected" value={counts.connected} onClick={() => setActiveStage("connected")} />
        <KpiCard icon={<CalendarIcon />} color="info" label="Appointment set" value={counts.appointment_set} onClick={() => setActiveStage("appointment_set")} />
        <KpiCard icon={<AlarmIcon />} color="bad" label="No show" value={counts.no_show} onClick={() => setActiveStage("no_show")} />
        <KpiCard icon={<WrenchIcon />} color="accent" label="RO entered" value={counts.ro_entered} onClick={() => setActiveStage("ro_entered")} />
        <KpiCard icon={<XCircleIcon />} color="bad" label="Not verified" value={counts.not_verified} onClick={() => setActiveStage("not_verified")} />
        <KpiCard icon={<CheckIcon />} color="good" label="Verified" value={counts.verified} onClick={() => setActiveStage("verified")} />
      </div>

      {/* Payout ledger */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-fg">
            <WalletIcon /> Payout ledger <span className="text-xs font-normal text-fg-faint">(all-time balance)</span>
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-fg">Total owed: {inr(totalOwed)}</span>
            <a href="/api/inactive-referrals/payout-export" className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover">
              Export CSV
            </a>
            <RescanButton />
          </div>
        </div>
        <div className="max-h-96 overflow-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface-2">
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Employee</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Branch</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Validated (₹50)</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Verified (₹200)</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Owed</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">&nbsp;</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payoutLedger.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-fg-muted">
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
                    <td className="px-3 py-2 text-right">
                      <MarkPaidButton employeeId={row.employeeId} employeeName={row.employeeName} employeeBranch={row.employeeBranch} amount={row.amountOwed} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment history */}
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

      {/* Branch breakdown */}
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
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Verified</th>
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
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-fg">
          <ListIcon /> All referrals{activeStage ? ` — ${activeStage.replace(/_/g, " ")}` : ""}
        </h2>
        {activeStage ? (
          <button type="button" onClick={() => setActiveStage(null)} className="mb-3 text-xs text-accent hover:underline">
            Clear filter
          </button>
        ) : null}
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Submitted</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Customer</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Branch</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Reg No</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Status</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Appointment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-fg-muted">
                    Nothing here.
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr key={r.id} className="cursor-pointer transition-colors hover:bg-surface-2/50" onClick={() => setSelected(r)}>
                    <td className="whitespace-nowrap px-3 py-2.5 text-fg-muted">{fmt(r.submittedAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-fg">{r.customerName}</div>
                      <div className="text-[11px] text-fg-faint">{r.referringEmployeeName ?? r.referringEmployeeId}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-fg-muted">{r.assignedBranch ? `${branchName(r.assignedBranch)} (${r.assignedBranch})` : "Unassigned"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-fg">{r.vehicleRegNo}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <StatusBadge stage={classify(r)} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-fg-muted">{r.appointmentDate ? fmtDate(r.appointmentDate) : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
