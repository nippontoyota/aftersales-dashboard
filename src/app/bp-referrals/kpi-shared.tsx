"use client";

/** Shared KPI-card / needs-attention / referral-table building blocks used by
 * both BP HO's company-wide analytics view (bp-ho-analytics-client.tsx) and
 * the branch-role's own hero section (bpm-queue-client.tsx) — extracted
 * 2026-11-27 so the branch view's hero cards reuse the exact same visuals
 * instead of a second copy. */

import { useMemo, useState } from "react";
import { control, eyebrow } from "@/lib/ui";
import { branchName } from "@/lib/branch-names";
import type { BpmQueueReferral } from "./bpm-queue-client";
import { AssignBranchForm } from "./bp-ho-controls";

export function fmt(ts: Date | string | null): string {
  if (!ts) return "—";
  const d = new Date(ts as string);
  if (isNaN(d.getTime())) return String(ts).slice(0, 16);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function hoursSince(ts: Date | string | null): number {
  if (!ts) return Infinity;
  const t = new Date(ts as string).getTime();
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60);
}

/** Mirrors lib/bp-referrals/store.ts's thresholds — kept in sync by hand
 * (that module is server-only). */
export const UNCONNECTED_DROP_DAYS = 3;
export const FOLLOW_UP_OVERDUE_HOURS = 24;

export type Status =
  | "pending"
  | "not_connected"
  | "followup"
  | "followup_overdue"
  | "vehicle_received"
  | "repair_in_progress"
  | "completed"
  | "not_genuine"
  | "not_interested"
  | "lost"
  | "self_arrived"
  | "dropped";

/** Same pipeline as the BPM queue's own call-status/action flow: Follow-up ->
 * Vehicle received (BPE entered, insurance-paid only) -> Repair in progress
 * (RO entered) -> Completed (RO confirmed, ₹200 triggered). */
export function classify(r: BpmQueueReferral): Status {
  if (r.ro_matched_at) return "completed";
  if (r.pending_ro_no) return "repair_in_progress";
  if (r.closed_reason === "not_genuine") return "not_genuine";
  if (r.closed_reason === "not_interested") return "not_interested";
  if (r.closed_reason === "self_arrived") return "self_arrived";
  if (r.closed_reason === "lost") return "lost";
  if (r.bp_estimate_invoice_no) return "vehicle_received";
  if (r.validated_at) return hoursSince(r.last_contacted_at) >= FOLLOW_UP_OVERDUE_HOURS ? "followup_overdue" : "followup";
  if (hoursSince(r.last_contacted_at ?? r.submitted_at) >= UNCONNECTED_DROP_DAYS * 24) return "dropped";
  if (r.call_status === "not_connected") return "not_connected";
  return "pending";
}

export const STATUS_LABEL: Record<Status, string> = {
  pending: "To call",
  not_connected: "Not connected",
  followup: "Validated — follow up",
  followup_overdue: "Follow-up overdue",
  vehicle_received: "Vehicle received",
  repair_in_progress: "Repair in progress",
  completed: "Completed",
  not_genuine: "Not genuine",
  not_interested: "Not interested",
  lost: "Lost",
  self_arrived: "Self arrived",
  dropped: "Dropped",
};
const STATUS_CLASS: Record<Status, string> = {
  pending: "bg-accent-soft text-accent-text",
  not_connected: "bg-accent-soft text-accent-text",
  followup: "bg-warn-soft text-warn-text",
  followup_overdue: "bg-bad-soft text-bad",
  vehicle_received: "bg-info-soft text-info",
  repair_in_progress: "bg-accent-soft text-accent-text",
  completed: "bg-good-soft text-good-text",
  not_genuine: "bg-surface-2 text-fg-faint",
  not_interested: "bg-surface-2 text-fg-faint",
  lost: "bg-surface-2 text-fg-faint",
  self_arrived: "bg-surface-2 text-fg-faint",
  dropped: "bg-bad-soft text-bad",
};

export function StatusBadge({ status }: { status: Status }) {
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
export const TotalIcon = () => iconBase(<><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" /><rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></>);
export const PhoneIcon = () => iconBase(<path d="M5 3h3l1.5 4-2 1.5a9 9 0 0 0 4 4l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A14 14 0 0 1 3.5 4.6 1.5 1.5 0 0 1 5 3z" strokeLinecap="round" strokeLinejoin="round" />);
export const PhoneOffIcon = () => iconBase(<><path d="M5 3h3l1.5 4-2 1.5a9 9 0 0 0 4 4l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A14 14 0 0 1 3.5 4.6 1.5 1.5 0 0 1 5 3z" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 3l14 14" strokeLinecap="round" /></>);
export const ClockIcon = () => iconBase(<><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" strokeLinecap="round" strokeLinejoin="round" /></>);
export const AlarmIcon = () => iconBase(<><circle cx="10" cy="11" r="6.5" /><path d="M10 8v3l2 1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 4.5 4 6.5M14 4.5l2 2" strokeLinecap="round" /></>);
export const CheckCircleIcon = () => iconBase(<><circle cx="10" cy="10" r="7" /><path d="M7 10l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></>);
export const CarIcon = () => iconBase(<><path d="M4 13V9.5L5.5 6h9L16 9.5V13" strokeLinecap="round" strokeLinejoin="round" /><path d="M3.5 13h13v2.5a.8.8 0 0 1-.8.8H14a.8.8 0 0 1-.8-.8V14.5h-6.4v1a.8.8 0 0 1-.8.8H4.3a.8.8 0 0 1-.8-.8V13z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6.5" cy="13" r="1" /><circle cx="13.5" cy="13" r="1" /></>);
export const WrenchIcon = () => iconBase(<path d="M13.5 4a3.5 3.5 0 0 0-4.6 3.9L4 12.8V16h3.2l4.9-4.9a3.5 3.5 0 0 0 3.9-4.6l-2.3 2.3-1.8-.6-.6-1.8L13.5 4z" strokeLinecap="round" strokeLinejoin="round" />);
export const XCircleIcon = () => iconBase(<><circle cx="10" cy="10" r="7" /><path d="M7.5 7.5l5 5M12.5 7.5l-5 5" strokeLinecap="round" /></>);
export const DashCircleIcon = () => iconBase(<><circle cx="10" cy="10" r="7" /><path d="M7 10h6" strokeLinecap="round" /></>);
export const WalletIcon = () => iconBase(<><rect x="3" y="5.5" width="14" height="10" rx="1.5" /><path d="M3 8.5h14" /><circle cx="14" cy="11.5" r="1" fill="currentColor" stroke="none" /></>);
export const BranchIcon = () => iconBase(<><path d="M5 3v6a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V8" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 12v5" strokeLinecap="round" /><circle cx="5" cy="3" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="10" cy="17" r="1.4" /></>);
export const ListIcon = () => iconBase(<><path d="M7 5h10M7 10h10M7 15h10" strokeLinecap="round" /><circle cx="3.5" cy="5" r="0.9" fill="currentColor" stroke="none" /><circle cx="3.5" cy="10" r="0.9" fill="currentColor" stroke="none" /><circle cx="3.5" cy="15" r="0.9" fill="currentColor" stroke="none" /></>);
export const ChevronRightIcon = () => iconBase(<path d="M7.5 4.5L13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />);

export type AccentColor = "neutral" | "accent" | "info" | "warn" | "bad" | "good";
const ACCENT: Record<AccentColor, { edge: string; chip: string }> = {
  neutral: { edge: "bg-fg-faint", chip: "bg-surface-2 text-fg-muted" },
  accent: { edge: "bg-accent", chip: "bg-accent-soft text-accent-text" },
  info: { edge: "bg-info-solid", chip: "bg-info-soft text-info" },
  warn: { edge: "bg-warn-solid", chip: "bg-warn-soft text-warn-text" },
  bad: { edge: "bg-bad-solid", chip: "bg-bad-soft text-bad" },
  good: { edge: "bg-good-solid", chip: "bg-good-soft text-good-text" },
};

export function KpiCard({
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

export function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
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

/** Shared referral-list table — same columns, same photo lightbox, used by
 * the main "All referrals" section, the KPI pop-up, and the branch hero's
 * needs-attention panels. */
export function ReferralTable({
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
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Submitted</th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Employee</th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Department</th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Branch</th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Reg No</th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Status</th>
            <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Estimate</th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Payment</th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Matched RO</th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Photo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-xs">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={10} className="px-2 py-8 text-center text-sm text-fg-muted">
                Nothing here.
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const status = classify(r);
              return (
                <tr key={r.id} className="transition-colors hover:bg-surface-2/50">
                  <td className="whitespace-nowrap px-2 py-1.5 text-fg-muted">{fmt(r.submitted_at)}</td>
                  <td className="px-2 py-1.5">
                    <div className="font-medium text-fg">{r.referring_employee_name ?? "—"}</div>
                    <div className="text-[11px] text-fg-faint">
                      {r.referring_employee_id ? `ID: ${r.referring_employee_id}` : null}
                      {r.referring_employee_branch ? ` · ${r.referring_employee_branch}` : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-fg-muted">{r.referring_employee_dept ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-fg-muted">
                    {r.assigned_branch ? (
                      <>
                        {branchName(r.assigned_branch)} ({r.assigned_branch})
                        {r.transferred_from ? <div className="text-[11px] text-fg-faint">from {branchName(r.transferred_from)}</div> : null}
                      </>
                    ) : (
                      <AssignBranchForm referralId={r.id} branchCodes={allBranchCodes} />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <div className="font-mono text-xs text-fg">{r.vehicle_reg_no ?? "—"}</div>
                    {r.vehicle_model ? <div className="text-[11px] text-fg-faint">{r.vehicle_model}</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <StatusBadge status={status} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-fg">
                    {r.estimate_amount != null ? inr(Number(r.estimate_amount)) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-fg-muted">
                    {r.payment_type === "CP" ? "Customer paid" : r.payment_type === "IP" ? "Insurance paid" : "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs text-fg">
                    {r.matched_ro_no ?? (r.pending_ro_no ? <span className="text-fg-faint">{r.pending_ro_no} (pending)</span> : "—")}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.vehicle_image_url ? (
                      <button
                        type="button"
                        onClick={() => onPhotoClick(r.id)}
                        className="group relative h-10 w-14 overflow-hidden rounded border border-border hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        aria-label="View vehicle photo"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/bp-referrals/photo/${r.id}`}
                          alt="Vehicle"
                          loading="lazy"
                          className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                        />
                      </button>
                    ) : (
                      <span className="flex h-10 w-14 items-center justify-center rounded border border-border bg-surface-2 text-[10px] text-fg-faint">
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

/** Filters local to a KPI pop-up — independent of any page-level filters. */
export function SlideOverFilters({
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

/** Centered pop-up for a clicked KPI card — fixed backdrop, centered
 * rounded-xl box, own close button, sized wide enough to hold a full table.
 * `showBranchFilter` hides the branch dropdown for a single-branch view
 * (the branch hero section) where it would only ever have one option. */
export function KpiModal({
  title,
  rows,
  branchCodes,
  onClose,
  onPhotoClick,
  showBranchFilter = true,
}: {
  title: string;
  rows: BpmQueueReferral[];
  branchCodes: string[];
  onClose: () => void;
  onPhotoClick: (id: number) => void;
  showBranchFilter?: boolean;
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [branchFilter, setBranchFilter] = useState("");

  const filtered = useMemo(() => {
    const result = rows.filter((r) => {
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
    // The Follow-up KPI mixes overdue and not-yet-overdue validated
    // referrals together — overdue ones come first, then validated-but-
    // not-overdue ones, oldest last contact first within each group.
    if (title === "Follow-up") {
      result.sort((a, b) => {
        const aOverdue = classify(a) === "followup_overdue" ? 0 : 1;
        const bOverdue = classify(b) === "followup_overdue" ? 0 : 1;
        if (aOverdue !== bOverdue) return aOverdue - bOverdue;
        return hoursSince(b.last_contacted_at ?? b.submitted_at) - hoursSince(a.last_contacted_at ?? a.submitted_at);
      });
    }
    return result;
  }, [rows, fromDate, toDate, branchFilter, title]);

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
          {showBranchFilter ? (
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
          ) : (
            <div className="mb-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <span className={eyebrow}>From</span>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={`${control} px-2`} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className={eyebrow}>To</span>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={`${control} px-2`} />
                </div>
              </div>
            </div>
          )}
          <ReferralTable rows={filtered} onPhotoClick={onPhotoClick} allBranchCodes={branchCodes} />
        </div>
      </div>
    </div>
  );
}
