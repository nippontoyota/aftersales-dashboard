"use client";

import { useActionState, useMemo, useState } from "react";
import { control, eyebrow } from "@/lib/ui";
import { branchName } from "@/lib/branch-names";
import {
  enterRoNumberAction,
  getCallHistoryAction,
  markAlreadyVisitedAction,
  markNotConnectedAction,
  setAppointmentDateAction,
  submitCallOutcomeAction,
  type EnterRoActionState,
  type ReferralActionState,
} from "./actions";
import type { InactiveReferralCallRow, InactiveReferralRow } from "@/lib/inactive-referrals/store";
import { NotConnectedReasonFields } from "./not-connected-reason-fields";

/** A referral older than this with a pending (unconfirmed) RO is surfaced
 * as "Not verified" rather than quietly sitting in "RO entered" forever —
 * mirrors BP Referrals' own "dropped" overdue convention. Not a rejection:
 * the next Service Info upload or HQ's re-scan can still confirm it any
 * time, this is visibility only. */
const NOT_VERIFIED_OVERDUE_DAYS = 30;

/** Grace window (2026-11-28, at the user's request) between the
 * appointment date passing and this flipping to a hard "No show" — real
 * incident: vehicles that had already come in were showing "No show —
 * follow up" before the branch manager had even had a chance to check,
 * purely because nobody had typed the RO number in yet. One day buys the
 * branch same-day-lag room to look the vehicle up before the system
 * accuses them of a no-show. */
const NO_SHOW_GRACE_DAYS = 1;

export type Stage =
  | "to_call"
  | "not_connected"
  | "connected"
  | "appointment_set"
  | "pending_verification"
  | "no_show"
  | "visited_awaiting_ro"
  | "ro_entered"
  | "not_verified"
  | "verified"
  | "closed";

export function fmt(ts: Date | string | null): string {
  if (!ts) return "—";
  const d = new Date(ts as string);
  if (isNaN(d.getTime())) return String(ts).slice(0, 16);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function daysSince(ts: Date | string | null): number {
  if (!ts) return Infinity;
  const t = new Date(ts as string).getTime();
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

const todayStr = () => new Date().toISOString().slice(0, 10);

/** Whole calendar days between an appointment date (YYYY-MM-DD) and today,
 * both read as UTC midnight so this doesn't drift with the server's local
 * time zone the way daysSince()'s now()-based math would near a day
 * boundary. */
function daysPastAppointment(appointmentDate: string): number {
  const apt = new Date(`${appointmentDate}T00:00:00Z`).getTime();
  const today = new Date(`${todayStr()}T00:00:00Z`).getTime();
  return Math.round((today - apt) / (1000 * 60 * 60 * 24));
}

/** The pipeline (2026-11-27, the user's call; grace window and the two
 * "don't presume a no-show" stages added 2026-11-28): To call -> Not
 * connected -> Connected -> Appointment set -> Appointment passed (soft,
 * within the grace window) -> No show (follow-up, not terminal — reschedule
 * returns it to "Appointment set") -> RO entered -> Verified / Not
 * verified. A branch can mark "Already visited" at any point after the
 * appointment date (pending-verification or no-show alike) to clear the
 * no-show framing immediately without yet having the RO number — see
 * visited_awaiting_ro below, which pre-empts the date math entirely since
 * the branch has already confirmed the visit. Closed (not genuine / not
 * interested) is a side bucket, same convention as BP Referrals'
 * not_genuine/not_interested. */
export function classify(r: InactiveReferralRow): Stage {
  if (r.matchedRoNo) return "verified";
  if (r.pendingRoNo) return daysSince(r.pendingRoEnteredAt) >= NOT_VERIFIED_OVERDUE_DAYS ? "not_verified" : "ro_entered";
  if (r.closedAt) return "closed";
  if (r.appointmentDate) {
    if (r.visitedAckAt) return "visited_awaiting_ro";
    if (r.appointmentDate >= todayStr()) return "appointment_set";
    return daysPastAppointment(r.appointmentDate) > NO_SHOW_GRACE_DAYS ? "no_show" : "pending_verification";
  }
  if (r.validatedAt) return "connected";
  if (r.callStatus === "not_connected") return "not_connected";
  return "to_call";
}

const STAGE_LABEL: Record<Stage, string> = {
  to_call: "To call",
  not_connected: "Not connected",
  connected: "Connected",
  appointment_set: "Appointment set",
  pending_verification: "Appointment passed — verify",
  no_show: "No show — follow up",
  visited_awaiting_ro: "Visited — RO pending",
  ro_entered: "RO entered",
  not_verified: "Not verified",
  verified: "Verified",
  closed: "Closed",
};

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${className}`} aria-hidden="true" />;
}

const STAGE_DOT: Record<Stage, string> = {
  to_call: "bg-accent",
  not_connected: "bg-warn-solid",
  connected: "bg-accent",
  appointment_set: "bg-info-solid",
  pending_verification: "bg-warn-solid",
  no_show: "bg-bad-solid",
  visited_awaiting_ro: "bg-accent",
  ro_entered: "bg-accent",
  not_verified: "bg-bad-solid",
  verified: "bg-good-solid",
  closed: "bg-fg-faint",
};
const STAGE_BADGE: Record<Stage, string> = {
  to_call: "bg-accent-soft text-accent-text",
  not_connected: "bg-warn-soft text-warn-text",
  connected: "bg-accent-soft text-accent-text",
  appointment_set: "bg-info-soft text-info",
  pending_verification: "bg-warn-soft text-warn-text",
  no_show: "bg-bad-soft text-bad",
  visited_awaiting_ro: "bg-accent-soft text-accent-text",
  ro_entered: "bg-accent-soft text-accent-text",
  not_verified: "bg-bad-soft text-bad",
  verified: "bg-good-soft text-good-text",
  closed: "bg-surface-2 text-fg-faint",
};

export function StatusBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_BADGE[stage]}`}>
      <Dot className={STAGE_DOT[stage]} />
      {STAGE_LABEL[stage]}
    </span>
  );
}

// ---- hero/KPI cards ----
type AccentColor = "neutral" | "accent" | "info" | "warn" | "bad" | "good";
const ACCENT: Record<AccentColor, { edge: string; chip: string }> = {
  neutral: { edge: "bg-fg-faint", chip: "bg-surface-2 text-fg-muted" },
  accent: { edge: "bg-accent", chip: "bg-accent-soft text-accent-text" },
  info: { edge: "bg-info-solid", chip: "bg-info-soft text-info" },
  warn: { edge: "bg-warn-solid", chip: "bg-warn-soft text-warn-text" },
  bad: { edge: "bg-bad-solid", chip: "bg-bad-soft text-bad" },
  good: { edge: "bg-good-solid", chip: "bg-good-soft text-good-text" },
};

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
const CheckCircleIcon = CheckIcon;
const CalendarQuestionIcon = () => iconBase(<><rect x="3.5" y="4.5" width="13" height="12" rx="1.5" /><path d="M3.5 8.5h13M7 3v3M13 3v3" strokeLinecap="round" /><path d="M9 11.5a1 1 0 0 1 1-1c.6 0 1.2.4 1.2 1 0 .6-1.2.7-1.2 1.6" strokeLinecap="round" /><circle cx="10" cy="15" r="0.4" fill="currentColor" stroke="none" /></>);
const EyeIcon = () => iconBase(<><path d="M2.5 10S5.5 5 10 5s7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="10" cy="10" r="2" /></>);

function KpiCard({ icon, color, label, value, active, onClick }: { icon: React.ReactNode; color: AccentColor; label: string; value: number; active: boolean; onClick: () => void }) {
  const accent = ACCENT[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-start overflow-hidden rounded-xl border bg-surface p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? "border-accent" : "border-border"}`}
    >
      <span className={`absolute inset-x-0 top-0 h-0.5 ${accent.edge}`} aria-hidden="true" />
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${accent.chip}`}>{icon}</div>
      <div className="mt-2 text-xl font-bold tabular-nums text-fg">{value}</div>
      <div className="text-[11px] font-medium text-fg-subtle">{label}</div>
    </button>
  );
}

const INIT: ReferralActionState = { error: null, ok: false };
const remarkField =
  "w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function CallHistory({ referralId }: { referralId: number }) {
  const [history, setHistory] = useState<InactiveReferralCallRow[] | null>(null);
  const [open, setOpen] = useState(false);

  const toggle = async () => {
    if (!open && history === null) setHistory(await getCallHistoryAction(referralId));
    setOpen((o) => !o);
  };

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <button type="button" onClick={toggle} className="text-[11px] font-medium text-accent-text hover:underline">
        {open ? "Hide call history" : "Show call history"}
      </button>
      {open ? (
        <ol className="mt-2 space-y-2 border-l border-border-subtle pl-3">
          {history && history.length > 0 ? (
            history.map((h) => (
              <li key={h.id} className="text-[12px]">
                <div className="font-medium text-fg">{h.callStatus === "connected" ? "Connected" : "Not connected"}</div>
                <p className="mt-0.5 whitespace-pre-wrap text-fg-muted">{h.remark}</p>
                <div className="mt-0.5 text-[10px] text-fg-faint">{h.performedBy} · {fmt(h.performedAt)}</div>
              </li>
            ))
          ) : (
            <li className="text-[12px] text-fg-faint">No calls logged yet.</li>
          )}
        </ol>
      ) : null}
    </div>
  );
}

function NotConnectedButton({ id, onDone }: { id: number; onDone: () => void }) {
  const [state, action, pending] = useActionState(markNotConnectedAction, INIT);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-8 rounded-md border border-border-strong px-3 text-sm font-medium text-fg-muted hover:bg-surface-2">
        Not connected
      </button>
    );
  }
  return (
    <form
      action={async (fd) => {
        await action(fd);
        onDone();
      }}
      className="space-y-2 rounded-md border border-border-strong bg-surface-2/50 p-3"
    >
      <input type="hidden" name="id" value={id} />
      <NotConnectedReasonFields textareaClassName={remarkField} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="h-8 rounded-md border border-border-strong px-3 text-sm font-medium text-fg-muted hover:bg-surface-2 disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-fg-muted hover:underline">
          Cancel
        </button>
        {state.error ? <span className="text-xs text-bad">{state.error}</span> : null}
      </div>
    </form>
  );
}

function CallOutcomeForm({ id, onDone }: { id: number; onDone: () => void }) {
  const [state, action, pending] = useActionState(submitCallOutcomeAction, INIT);
  const [genuine, setGenuine] = useState<"yes" | "no" | "">("");
  const [interested, setInterested] = useState<"yes" | "no" | "">("");

  return (
    <form
      action={async (fd) => {
        await action(fd);
        onDone();
      }}
      className="space-y-3 rounded-lg border border-border-strong bg-surface-2/50 p-3"
    >
      <input type="hidden" name="id" value={id} />
      <div>
        <span className={eyebrow}>Genuine inactive customer?</span>
        <div className="mt-1 flex gap-2">
          {(["yes", "no"] as const).map((v) => (
            <label key={v} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${genuine === v ? "border-accent bg-accent-soft text-accent-text" : "border-border-strong text-fg-muted"}`}>
              <input
                type="radio"
                name="genuine"
                value={v}
                checked={genuine === v}
                onChange={() => {
                  setGenuine(v);
                  // Switching the top answer always clears whatever was
                  // picked under the old one (2026-11-27, fixing a real bug
                  // — the appointment date field used to stay visible after
                  // flipping back to "No" here, since it only checked
                  // `interested`, never `genuine`, and this state was never
                  // reset).
                  setInterested("");
                }}
                className="sr-only"
              />
              {v === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      </div>

      {genuine === "no" ? (
        <div>
          <span className={eyebrow}>Why isn&apos;t this a genuine inactive customer? (required)</span>
          <textarea name="notGenuineReason" required rows={2} className={remarkField} />
        </div>
      ) : null}

      {genuine === "yes" ? (
        <div>
          <span className={eyebrow}>Customer interested in coming in?</span>
          <div className="mt-1 flex gap-2">
            {(["yes", "no"] as const).map((v) => (
              <label key={v} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${interested === v ? "border-accent bg-accent-soft text-accent-text" : "border-border-strong text-fg-muted"}`}>
                <input type="radio" name="customerInterested" value={v} checked={interested === v} onChange={() => setInterested(v)} className="sr-only" />
                {v === "yes" ? "Yes" : "No"}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {genuine === "yes" && interested === "no" ? (
        <div>
          <span className={eyebrow}>Why isn&apos;t the customer interested? (required)</span>
          <textarea name="notInterestedReason" required rows={2} className={remarkField} />
        </div>
      ) : null}

      {genuine === "yes" && interested === "yes" ? (
        <>
          <div>
            <span className={eyebrow}>Appointment date (if they gave you one)</span>
            <input type="date" name="appointmentDate" className={`${control} mt-1 w-full px-2`} />
            <p className="mt-1 text-[11px] text-fg-faint">Leave blank if they haven&apos;t committed a date yet — you can set it later.</p>
          </div>
          <div>
            <span className={eyebrow}>Notes (optional)</span>
            <textarea name="remark" rows={2} className={remarkField} />
          </div>
        </>
      ) : null}

      {genuine === "no" || (genuine === "yes" && interested) ? (
        <div className="flex items-center gap-2 pt-1">
          <button type="submit" disabled={pending} className="h-8 rounded-md bg-accent px-3 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60">
            {pending ? "Saving…" : "Save call outcome"}
          </button>
          {state.error ? <span className="text-xs text-bad">{state.error}</span> : null}
        </div>
      ) : null}
    </form>
  );
}

function AppointmentForm({ id, reschedule, onDone }: { id: number; reschedule: boolean; onDone: () => void }) {
  const [state, action, pending] = useActionState(setAppointmentDateAction, INIT);
  return (
    <form
      action={async (fd) => {
        await action(fd);
        onDone();
      }}
      className="space-y-2 rounded-lg border border-border-strong bg-surface-2/50 p-3"
    >
      <input type="hidden" name="id" value={id} />
      <div>
        <span className={eyebrow}>{reschedule ? "New appointment date" : "Appointment date"} (required)</span>
        <input type="date" name="appointmentDate" required className={`${control} mt-1 w-full px-2`} />
      </div>
      <div>
        <span className={eyebrow}>{reschedule ? "What did the customer say this time?" : "Remark"} (required)</span>
        <textarea name="remark" required rows={2} className={remarkField} />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="h-8 rounded-md bg-accent px-3 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60">
          {pending ? "Saving…" : reschedule ? "Reschedule" : "Save appointment date"}
        </button>
        {state.error ? <span className="text-xs text-bad">{state.error}</span> : null}
      </div>
    </form>
  );
}

/** The quick escape hatch (2026-11-28, at the user's request) for when the
 * branch already knows the vehicle came in but doesn't have the RO number
 * to hand yet — clears the no-show framing immediately; the referral then
 * sits in "Visited — RO pending" until EnterRoForm below is used, same
 * verification/payout path as always (see markAlreadyVisited in store.ts).
 * One click, no extra fields — unlike NotConnectedButton this never needs a
 * reason, so there's nothing to gate behind an "open" step.
 *
 * Deliberately does NOT close the modal (2026-11-28, fixing a real
 * complaint: closing forced the branch to reopen the referral just to reach
 * the RO field they were about to use anyway). onMarked instead flips the
 * modal's local "just marked visited" flag so it re-renders straight into
 * the EnterRoForm in the same view. */
function AlreadyVisitedButton({ id, onMarked }: { id: number; onMarked: () => void }) {
  const [state, action, pending] = useActionState(markAlreadyVisitedAction, INIT);
  return (
    <form
      action={async (fd) => {
        await action(fd);
        onMarked();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="h-8 rounded-md border border-border-strong px-3 text-sm font-medium text-fg-muted hover:bg-surface-2 disabled:opacity-60">
        {pending ? "Saving…" : "Already visited"}
      </button>
      {state.error ? <p className="mt-1 text-xs text-bad">{state.error}</p> : null}
    </form>
  );
}

const ENTER_RO_INIT: EnterRoActionState = { error: null, status: null };

function EnterRoForm({ id, pendingRoNo }: { id: number; pendingRoNo: string | null }) {
  const [state, action, pending] = useActionState(enterRoNumberAction, ENTER_RO_INIT);
  return (
    <form action={action} onClick={(e) => e.stopPropagation()} className="space-y-2 rounded-lg border border-border-strong bg-surface-2/50 p-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <span className={eyebrow}>RO number (required)</span>
        <input name="roNo" required defaultValue={pendingRoNo ?? ""} placeholder="e.g. 1234567" className={`${control} mt-1 w-full px-2 font-mono`} />
      </div>
      <button type="submit" disabled={pending} className="h-8 rounded-md bg-accent px-3 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60">
        {pending ? "Saving…" : "Save RO number"}
      </button>
      {state.error ? <p className="text-xs text-bad">{state.error}</p> : null}
      {state.status === "pending" ? <p className="text-xs text-fg-faint">Pending — verifies on the next Service Info upload.</p> : null}
      {state.status === "completed" ? <p className="text-xs text-good-text">Confirmed — ₹200 triggered.</p> : null}
    </form>
  );
}

export function DetailModal({ referral, ownBranch, readOnly, onClose }: { referral: InactiveReferralRow; ownBranch: string; readOnly: boolean; onClose: () => void }) {
  const r = referral;
  // Overrides classify(r) the instant "Already visited" is clicked, so the
  // modal moves straight to the RO field without waiting on a close/reopen
  // round trip to pick up the server's freshly-updated visited_ack_at.
  const [justMarkedVisited, setJustMarkedVisited] = useState(false);
  const stage = justMarkedVisited ? "visited_awaiting_ro" : classify(r);
  const canAct = !readOnly && r.assignedBranch === ownBranch;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-fg">{r.customerName}</h2>
            <p className="text-xs text-fg-faint">
              {r.vehicleRegNo} · {r.vehicleModel}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-fg-faint hover:bg-surface-2">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-3">
          <StatusBadge stage={stage} />
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-fg-faint">Phone</dt>
            <dd className="font-semibold text-fg">
              {r.customerPhone1}
              {r.customerPhone2 ? ` / ${r.customerPhone2}` : ""}
            </dd>
          </div>
          {r.customerAddress ? (
            <div>
              <dt className="text-fg-faint">Address</dt>
              <dd className="mt-0.5 text-fg-muted">{r.customerAddress}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-fg-faint">Referred by</dt>
            <dd className="text-fg-muted">{r.referringEmployeeName ?? r.referringEmployeeId}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-fg-faint">Submitted</dt>
            <dd className="text-fg-muted">{r.referralDate ?? fmt(r.submittedAt)}</dd>
          </div>
          {r.genuine !== null ? (
            <div className="flex justify-between gap-3">
              <dt className="text-fg-faint">Genuine</dt>
              <dd className="text-fg">{r.genuine ? "Yes" : "No"}</dd>
            </div>
          ) : null}
          {r.notGenuineReason ? (
            <div>
              <dt className="text-fg-faint">Why not genuine</dt>
              <dd className="mt-0.5 text-fg">{r.notGenuineReason}</dd>
            </div>
          ) : null}
          {r.customerInterested !== null ? (
            <div className="flex justify-between gap-3">
              <dt className="text-fg-faint">Interested</dt>
              <dd className="text-fg">{r.customerInterested ? "Yes" : "No"}</dd>
            </div>
          ) : null}
          {r.notInterestedReason ? (
            <div>
              <dt className="text-fg-faint">Why not interested</dt>
              <dd className="mt-0.5 text-fg">{r.notInterestedReason}</dd>
            </div>
          ) : null}
          {r.appointmentDate ? (
            <div className="flex justify-between gap-3">
              <dt className="text-fg-faint">Appointment date</dt>
              <dd className="text-fg">{fmtDate(r.appointmentDate)}</dd>
            </div>
          ) : null}
          {r.visitedAckAt || justMarkedVisited ? (
            <div className="flex justify-between gap-3">
              <dt className="text-fg-faint">Marked visited</dt>
              <dd className="text-fg">
                {r.visitedAckAt ? fmt(r.visitedAckAt) : "Just now"}
                {r.visitedAckBy ? ` · ${r.visitedAckBy}` : ""}
              </dd>
            </div>
          ) : null}
          {r.matchedRoNo ? (
            <div className="flex justify-between gap-3">
              <dt className="text-fg-faint">Verified RO</dt>
              <dd className="font-mono text-fg">
                {r.matchedRoNo}
                <span className="ml-1.5 font-sans text-[11px] text-fg-faint">· {fmt(r.roMatchedAt)}</span>
              </dd>
            </div>
          ) : r.pendingRoNo ? (
            <div className="flex justify-between gap-3">
              <dt className="text-fg-faint">RO entered (pending)</dt>
              <dd className="font-mono text-fg">
                {r.pendingRoNo}
                <span className="ml-1.5 font-sans text-[11px] text-fg-faint">· {fmt(r.pendingRoEnteredAt)}</span>
              </dd>
            </div>
          ) : null}
          {r.handledBy ? (
            <div className="flex justify-between gap-3">
              <dt className="text-fg-faint">Handled by</dt>
              <dd className="text-fg">{r.handledBy}</dd>
            </div>
          ) : null}
        </dl>

        <CallHistory referralId={r.id} />

        {canAct && (stage === "to_call" || stage === "not_connected") ? (
          <div className="mt-4 space-y-3 border-t border-border-subtle pt-3">
            <NotConnectedButton id={r.id} onDone={onClose} />
            <CallOutcomeForm id={r.id} onDone={onClose} />
          </div>
        ) : null}

        {canAct && stage === "connected" ? (
          <div className="mt-4 border-t border-border-subtle pt-3">
            <AppointmentForm id={r.id} reschedule={false} onDone={onClose} />
          </div>
        ) : null}

        {canAct && stage === "pending_verification" ? (
          <div className="mt-4 rounded-md border border-warn/30 bg-warn-soft/40 px-3 py-2 text-xs text-warn-text">
            Appointment date passed — check with the customer or your service board before assuming a no-show. If the vehicle already came in, mark it below instead of rescheduling.
          </div>
        ) : null}

        {canAct && stage === "no_show" ? (
          <div className="mt-4 rounded-md border border-bad/30 bg-bad-soft/40 px-3 py-2 text-xs text-bad">
            Appointment date passed with no RO entered — re-contact the customer and reschedule below, or mark it as already visited if the vehicle came in.
          </div>
        ) : null}

        {canAct && stage === "visited_awaiting_ro" ? (
          <div className="mt-4 rounded-md border border-accent/30 bg-accent-soft/40 px-3 py-2 text-xs text-accent-text">
            Marked as already visited{r.visitedAckAt ? ` on ${fmt(r.visitedAckAt)}` : ""} — enter the RO number below once you have it.
          </div>
        ) : null}

        {canAct && (stage === "appointment_set" || stage === "pending_verification" || stage === "no_show") ? (
          <div className="mt-4 space-y-3 border-t border-border-subtle pt-3">
            {stage === "pending_verification" || stage === "no_show" ? <AlreadyVisitedButton id={r.id} onMarked={() => setJustMarkedVisited(true)} /> : null}
            <AppointmentForm id={r.id} reschedule={true} onDone={onClose} />
            <EnterRoForm id={r.id} pendingRoNo={r.pendingRoNo} />
          </div>
        ) : null}

        {canAct && (stage === "ro_entered" || stage === "visited_awaiting_ro") ? (
          <div className="mt-4 border-t border-border-subtle pt-3">
            <EnterRoForm id={r.id} pendingRoNo={r.pendingRoNo} />
          </div>
        ) : null}

        {canAct && stage === "not_verified" ? (
          <div className="mt-4 space-y-3 border-t border-border-subtle pt-3">
            <p className="rounded-md border border-bad/30 bg-bad-soft/40 px-3 py-2 text-xs text-bad">
              This RO hasn&apos;t matched any Service Info upload in {NOT_VERIFIED_OVERDUE_DAYS}+ days — check the number and re-enter if it was mistyped.
            </p>
            <EnterRoForm id={r.id} pendingRoNo={r.pendingRoNo} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ReferralsQueueClient({
  queue,
  ownBranch,
  readOnly = false,
  showBranch = false,
}: {
  queue: InactiveReferralRow[];
  ownBranch: string;
  readOnly?: boolean;
  showBranch?: boolean;
}) {
  const [selected, setSelected] = useState<InactiveReferralRow | null>(null);
  const [activeStage, setActiveStage] = useState<Stage | null>(null);

  const classified = useMemo(() => queue.map((r) => ({ r, stage: classify(r) })), [queue]);
  const counts = useMemo(() => {
    const c: Record<Stage, number> = {
      to_call: 0, not_connected: 0, connected: 0, appointment_set: 0, pending_verification: 0, no_show: 0,
      visited_awaiting_ro: 0, ro_entered: 0, not_verified: 0, verified: 0, closed: 0,
    };
    for (const { stage } of classified) c[stage]++;
    return c;
  }, [classified]);

  const visible = activeStage ? queue.filter((r) => classify(r) === activeStage) : queue;

  return (
    <div>
      {selected ? <DetailModal referral={selected} ownBranch={ownBranch} readOnly={readOnly} onClose={() => setSelected(null)} /> : null}

      <h1 className="text-lg font-semibold text-fg">3C Referrals</h1>
      <p className="mt-1 text-sm text-fg-muted">
        {readOnly
          ? "Inactive customers referred by employees for re-engagement, across every branch."
          : "Inactive customers referred by employees for re-engagement. Call each one, record what happened, and track them through to a verified visit."}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        <KpiCard icon={<TotalIcon />} color="neutral" label="Total" value={queue.length} active={activeStage === null} onClick={() => setActiveStage(null)} />
        <KpiCard icon={<PhoneIcon />} color="accent" label="To call" value={counts.to_call} active={activeStage === "to_call"} onClick={() => setActiveStage("to_call")} />
        <KpiCard icon={<PhoneOffIcon />} color="warn" label="Not connected" value={counts.not_connected} active={activeStage === "not_connected"} onClick={() => setActiveStage("not_connected")} />
        <KpiCard icon={<CheckIcon />} color="accent" label="Connected" value={counts.connected} active={activeStage === "connected"} onClick={() => setActiveStage("connected")} />
        <KpiCard icon={<CalendarIcon />} color="info" label="Appointment set" value={counts.appointment_set} active={activeStage === "appointment_set"} onClick={() => setActiveStage("appointment_set")} />
        <KpiCard icon={<CalendarQuestionIcon />} color="warn" label="Appointment passed" value={counts.pending_verification} active={activeStage === "pending_verification"} onClick={() => setActiveStage("pending_verification")} />
        <KpiCard icon={<AlarmIcon />} color="bad" label="No show" value={counts.no_show} active={activeStage === "no_show"} onClick={() => setActiveStage("no_show")} />
        <KpiCard icon={<EyeIcon />} color="accent" label="Visited — RO pending" value={counts.visited_awaiting_ro} active={activeStage === "visited_awaiting_ro"} onClick={() => setActiveStage("visited_awaiting_ro")} />
        <KpiCard icon={<WrenchIcon />} color="accent" label="RO entered" value={counts.ro_entered} active={activeStage === "ro_entered"} onClick={() => setActiveStage("ro_entered")} />
        <KpiCard icon={<XCircleIcon />} color="bad" label="Not verified" value={counts.not_verified} active={activeStage === "not_verified"} onClick={() => setActiveStage("not_verified")} />
        <KpiCard icon={<CheckCircleIcon />} color="good" label="Verified" value={counts.verified} active={activeStage === "verified"} onClick={() => setActiveStage("verified")} />
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 text-sm text-fg-faint">{readOnly ? "No referrals yet." : "Nothing here."}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {visible.map((r) => {
            const stage = classify(r);
            return (
              <li
                key={r.id}
                onClick={() => setSelected(r)}
                className="cursor-pointer rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:bg-surface-2/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-fg">{r.customerName}</div>
                    <div className="mt-0.5 text-[12px] text-fg-muted">
                      {r.vehicleRegNo} · {r.vehicleModel}
                    </div>
                    <div className="mt-0.5 text-[12px] text-fg-muted">
                      {r.customerPhone1}
                      {r.customerPhone2 ? ` / ${r.customerPhone2}` : ""}
                    </div>
                  </div>
                  <StatusBadge stage={stage} />
                </div>
                <div className="mt-2 text-[11px] text-fg-faint">
                  Referred by {r.referringEmployeeName ?? r.referringEmployeeId} · {r.referralDate ?? fmt(r.submittedAt)}
                  {showBranch ? ` · ${r.assignedBranch ? branchName(r.assignedBranch) : "Unassigned"}` : ""}
                  {r.appointmentDate ? ` · Appointment ${fmtDate(r.appointmentDate)}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
