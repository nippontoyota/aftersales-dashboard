"use client";

import { useActionState, useState } from "react";
import { getCallHistoryAction, markConnectedAction, markNotConnectedAction, type ReferralActionState } from "./actions";
import type { InactiveReferralCallRow, InactiveReferralRow } from "@/lib/inactive-referrals/store";
import { branchName } from "@/lib/branch-names";

const INIT: ReferralActionState = { error: null, ok: false };

const textareaClass =
  "w-full rounded-md border border-border-strong bg-surface px-2 py-1 text-[12px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const buttonClass =
  "rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60";
const ghostButtonClass =
  "rounded-md border border-border px-2 py-1 text-[11px] font-medium text-fg-muted hover:bg-surface-2 disabled:opacity-60";

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${className}`} aria-hidden="true" />;
}

function StatusBadge({ status }: { status: InactiveReferralRow["callStatus"] }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-medium text-good-text">
        <Dot className="bg-good-solid" />
        Connected
      </span>
    );
  }
  if (status === "not_connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn-text">
        <Dot className="bg-warn-solid" />
        Not connected yet
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-faint">
      <Dot className="bg-fg-faint" />
      To call
    </span>
  );
}

function fmt(ts: Date | string | null): string {
  if (!ts) return "—";
  const d = new Date(ts as string);
  if (isNaN(d.getTime())) return String(ts).slice(0, 16);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CallHistory({ referralId }: { referralId: number }) {
  const [history, setHistory] = useState<InactiveReferralCallRow[] | null>(null);
  const [open, setOpen] = useState(false);

  const toggle = async () => {
    if (!open && history === null) setHistory(await getCallHistoryAction(referralId));
    setOpen((o) => !o);
  };

  return (
    <div className="mt-2">
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

function CallActions({ referral }: { referral: InactiveReferralRow }) {
  const [notConnectedState, notConnectedAction, notConnectedPending] = useActionState(markNotConnectedAction, INIT);
  const [connectedState, connectedAction, connectedPending] = useActionState(markConnectedAction, INIT);
  const [mode, setMode] = useState<"none" | "not_connected" | "connected">("none");

  if (mode === "not_connected") {
    return (
      <form action={notConnectedAction} className="mt-2 space-y-1.5">
        <input type="hidden" name="id" value={referral.id} />
        <textarea name="remark" required rows={2} placeholder="What happened on the call? (e.g. no answer, wrong number)" className={textareaClass} />
        <div className="flex items-center gap-2">
          <button type="submit" disabled={notConnectedPending} className={buttonClass}>
            {notConnectedPending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setMode("none")} className={ghostButtonClass}>
            Cancel
          </button>
          {notConnectedState.error ? <span className="text-[11px] text-bad">{notConnectedState.error}</span> : null}
        </div>
      </form>
    );
  }

  if (mode === "connected") {
    return (
      <form action={connectedAction} className="mt-2 space-y-1.5">
        <input type="hidden" name="id" value={referral.id} />
        <textarea name="remark" required rows={2} placeholder="What did the customer say?" className={textareaClass} />
        <div className="flex items-center gap-2">
          <button type="submit" disabled={connectedPending} className={buttonClass}>
            {connectedPending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setMode("none")} className={ghostButtonClass}>
            Cancel
          </button>
          {connectedState.error ? <span className="text-[11px] text-bad">{connectedState.error}</span> : null}
        </div>
      </form>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <button type="button" onClick={() => setMode("connected")} className={buttonClass}>
        Mark connected
      </button>
      <button type="button" onClick={() => setMode("not_connected")} className={ghostButtonClass}>
        Mark not connected
      </button>
    </div>
  );
}

export function ReferralsQueueClient({
  queue,
  readOnly = false,
  showBranch = false,
}: {
  queue: InactiveReferralRow[];
  /** HQ's company-wide view — no call/update actions, just visibility. */
  readOnly?: boolean;
  /** Shows which branch each referral is assigned to — only meaningful
   * once the list spans more than one branch (HQ's view). */
  showBranch?: boolean;
}) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-fg">Referrals</h1>
      <p className="mt-1 text-sm text-fg-muted">
        {readOnly
          ? "Inactive customers referred by employees for re-engagement, across every branch."
          : "Inactive customers referred by employees for re-engagement. Call each one and record what happened."}
      </p>

      {queue.length === 0 ? (
        <p className="mt-6 text-sm text-fg-faint">{readOnly ? "No referrals yet." : "No referrals for your branch yet."}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {queue.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
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
                  {r.customerAddress ? <div className="mt-0.5 text-[12px] text-fg-faint">{r.customerAddress}</div> : null}
                </div>
                <StatusBadge status={r.callStatus} />
              </div>
              <div className="mt-2 text-[11px] text-fg-faint">
                Referred by {r.referringEmployeeName ?? r.referringEmployeeId} · {r.referralDate ?? fmt(r.submittedAt)}
                {showBranch ? ` · ${r.assignedBranch ? branchName(r.assignedBranch) : "Unassigned"}` : ""}
                {r.handledBy ? ` · Handled by ${r.handledBy}` : ""}
              </div>
              {readOnly ? null : <CallActions referral={r} />}
              <CallHistory referralId={r.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
