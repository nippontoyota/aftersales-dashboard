"use client";

import { useMemo, useState } from "react";
import { control, eyebrow } from "@/lib/ui";
import { branchName } from "@/lib/branch-names";
import type { BpmQueueReferral } from "./bpm-queue-client";
import type { PayoutLedgerRow, BranchRollupRow } from "@/lib/bp-referrals/store";
import { AssignBranchForm, RescanButton } from "./bp-ho-controls";

function fmt(ts: Date | string | null): string {
  if (!ts) return "—";
  const d = new Date(ts as string);
  if (isNaN(d.getTime())) return String(ts).slice(0, 16);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function hoursSince(ts: Date | string | null): number {
  if (!ts) return Infinity;
  const t = new Date(ts as string).getTime();
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60);
}

/** Mirrors lib/bp-referrals/store.ts's thresholds — kept in sync by hand,
 * same reasoning as bpm-queue-client.tsx (that module is server-only). */
const UNCONNECTED_DROP_DAYS = 3;
const FOLLOW_UP_OVERDUE_HOURS = 24;

type Status = "pending" | "not_connected" | "followup" | "followup_overdue" | "completed" | "not_genuine" | "not_interested" | "dropped";

function classify(r: BpmQueueReferral): Status {
  if (r.ro_matched_at) return "completed";
  if (r.closed_reason === "not_genuine") return "not_genuine";
  if (r.closed_reason === "not_interested") return "not_interested";
  if (r.validated_at) return hoursSince(r.last_contacted_at) >= FOLLOW_UP_OVERDUE_HOURS ? "followup_overdue" : "followup";
  if (hoursSince(r.last_contacted_at ?? r.submitted_at) >= UNCONNECTED_DROP_DAYS * 24) return "dropped";
  if (r.call_status === "not_connected") return "not_connected";
  return "pending";
}

const STATUS_LABEL: Record<Status, string> = {
  pending: "To call",
  not_connected: "Not connected",
  followup: "Validated — follow up",
  followup_overdue: "Follow-up overdue",
  completed: "Completed",
  not_genuine: "Not genuine",
  not_interested: "Not interested",
  dropped: "Dropped",
};
const STATUS_CLASS: Record<Status, string> = {
  pending: "bg-accent-soft text-accent-text",
  not_connected: "bg-accent-soft text-accent-text",
  followup: "bg-warn-soft text-warn-text",
  followup_overdue: "bg-bad-soft text-bad",
  completed: "bg-good-soft text-good-text",
  not_genuine: "bg-surface-2 text-fg-faint",
  not_interested: "bg-surface-2 text-fg-faint",
  dropped: "bg-bad-soft text-bad",
};

function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

// ---- icons (20x20 viewBox, matches dashboard-icons.tsx convention) ----
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
const ClockIcon = () => iconBase(<><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" strokeLinecap="round" strokeLinejoin="round" /></>);
const AlarmIcon = () => iconBase(<><circle cx="10" cy="11" r="6.5" /><path d="M10 8v3l2 1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 4.5 4 6.5M14 4.5l2 2" strokeLinecap="round" /></>);
const CheckCircleIcon = () => iconBase(<><circle cx="10" cy="10" r="7" /><path d="M7 10l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></>);
const XCircleIcon = () => iconBase(<><circle cx="10" cy="10" r="7" /><path d="M7.5 7.5l5 5M12.5 7.5l-5 5" strokeLinecap="round" /></>);
const DashCircleIcon = () => iconBase(<><circle cx="10" cy="10" r="7" /><path d="M7 10h6" strokeLinecap="round" /></>);
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

function KpiCard({
  icon,
  color,
  label,
  value,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  color: AccentColor;
  label: string;
  value: number;
  sub?: string;
  onClick: () => void;
}) {
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
      {sub ? <div className="mt-0.5 text-[10px] text-fg-faint">{sub}</div> : null}
    </button>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80" onClick={onClose}>
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

/** Shared referral-list table used both by the main "All referrals" section
 * and inside the KPI slide-over — same columns, same photo lightbox. */
function ReferralTable({
  rows,
  onPhotoClick,
  allBranchCodes,
}: {
  rows: BpmQueueReferral[];
  onPhotoClick: (id: number) => void;
  allBranchCodes: string[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
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
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center text-sm text-fg-muted">
                Nothing here.
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const status = classify(r);
              return (
                <tr key={r.id} className="transition-colors hover:bg-surface-2/50">
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
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="font-mono text-xs text-fg">{r.vehicle_reg_no ?? "—"}</div>
                    {r.vehicle_model ? <div className="text-xs text-fg-faint">{r.vehicle_model}</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <StatusBadge status={status} />
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
                        onClick={() => onPhotoClick(r.id)}
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
  );
}

/** Filters local to the KPI slide-over — independent of the main page's own
 * "All referrals" filters, scoped to just the clicked status bucket. */
function SlideOverFilters({
  fromDate,
  toDate,
  branchFilter,
  setFromDate,
  setToDate,
  setBranchFilter,
  branchCodes,
}: {
  fromDate: string;
  toDate: string;
  branchFilter: string;
  setFromDate: (v: string) => void;
  setToDate: (v: string) => void;
  setBranchFilter: (v: string) => void;
  branchCodes: string[];
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
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
          {branchCodes.map((b) => (
            <option key={b} value={b}>
              {branchName(b)} ({b})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Centered pop-up for a clicked KPI card (2026-10-16, replacing an
 * edge-anchored slide-over the user found uncomfortable) — same visual
 * language as the referral detail modal in bpm-queue-client.tsx (fixed
 * backdrop, centered rounded-xl box, own close button), just sized wider to
 * hold a full table. */
function KpiModal({
  title,
  rows,
  branchCodes,
  onClose,
  onPhotoClick,
}: {
  title: string;
  rows: BpmQueueReferral[];
  branchCodes: string[];
  onClose: () => void;
  onPhotoClick: (id: number) => void;
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [branchFilter, setBranchFilter] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
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
  }, [rows, fromDate, toDate, branchFilter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-fg">{title}</h2>
            <p className="text-xs text-fg-muted">
              {filtered.length} of {rows.length} referral{rows.length === 1 ? "" : "s"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-fg-faint hover:bg-surface-2">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M4 4l12 12M16 4L4 16" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4">
            <SlideOverFilters
              fromDate={fromDate}
              toDate={toDate}
              branchFilter={branchFilter}
              setFromDate={setFromDate}
              setToDate={setToDate}
              setBranchFilter={setBranchFilter}
              branchCodes={branchCodes}
            />
          </div>
          <ReferralTable rows={filtered} onPhotoClick={onPhotoClick} allBranchCodes={branchCodes} />
        </div>
      </div>
    </div>
  );
}

export function BpHoAnalyticsClient({
  referrals,
  payoutLedger,
  branchRollup,
  branchCodes: allBranchCodes,
}: {
  referrals: BpmQueueReferral[];
  payoutLedger: PayoutLedgerRow[];
  branchRollup: BranchRollupRow[];
  branchCodes: string[];
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [activeSlideOver, setActiveSlideOver] = useState<{ title: string; predicate: (r: BpmQueueReferral) => boolean } | null>(null);

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
      completed: 0,
      not_genuine: 0,
      not_interested: 0,
      dropped: 0,
    };
    for (const { status } of classified) counts[status]++;
    const totalOwed = payoutLedger.reduce((sum, r) => sum + r.amountOwed, 0);
    return { total: referrals.length, counts, totalOwed };
  }, [classified, referrals.length, payoutLedger]);

  const overdueFollowUps = useMemo(() => classified.filter((c) => c.status === "followup_overdue").map((c) => c.r), [classified]);
  const dropped = useMemo(() => classified.filter((c) => c.status === "dropped").map((c) => c.r), [classified]);

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

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg">BP Referrals</h1>
        <p className="mt-1 text-sm text-fg-muted">Company-wide Body &amp; Paint referral analytics — {kpis.total} total referrals.</p>
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
      </div>

      {/* Needs attention */}
      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-bad/30 bg-surface shadow-sm">
          <div className="flex items-center gap-2 border-b border-bad/20 bg-bad-soft/40 px-4 py-2.5">
            <AlarmIcon />
            <h2 className="text-sm font-bold text-bad">Follow-ups overdue (24h+)</h2>
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
            <WalletIcon /> Payout ledger
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-fg">Total owed: {inr(kpis.totalOwed)}</span>
            <a
              href="/api/bp-referrals/payout-export"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover"
            >
              Export CSV
            </a>
            <RescanButton />
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
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
          <ListIcon /> All referrals
        </h2>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <SlideOverFilters
            fromDate={fromDate}
            toDate={toDate}
            branchFilter={branchFilter}
            setFromDate={setFromDate}
            setToDate={setToDate}
            setBranchFilter={setBranchFilter}
            branchCodes={filterBranchCodes}
          />
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

        <ReferralTable rows={filtered} onPhotoClick={(id) => setLightboxUrl(`/api/bp-referrals/photo/${id}`)} allBranchCodes={allBranchCodes} />
      </div>
    </div>
  );
}
