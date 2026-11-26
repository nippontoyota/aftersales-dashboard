"use client";

import { useActionState, useState } from "react";
import { submitBranchJustificationAction, submitRegionalJustificationAction, type JustificationActionState } from "./justification-actions";
import type { BranchResolution, JustificationStatus } from "@/lib/cancellation/justifications";

const INIT: JustificationActionState = { error: null, ok: false };

const textareaClass =
  "w-full rounded-md border border-border-strong bg-surface px-2 py-1 text-[12px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const inputClass = textareaClass;
const selectClass = textareaClass;
const buttonClass =
  "rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60";
const rejectButtonClass =
  "rounded-md border border-bad/40 bg-surface px-2 py-1 text-[11px] font-semibold text-bad hover:bg-bad-soft disabled:opacity-60";

const RESOLUTION_LABEL: Record<BranchResolution, string> = {
  ro_cancelled: "RO cancelled — rebilled under a new RO",
  still_not_closed: "Still not closed",
};

/** Inline justification control on a flagged cancellation row — branch
 * submits first (a reason + remark, and the new RO number if they say it
 * was rebilled), their regional manager approves or rejects on top of it,
 * HQ sees it read-only. A reject lets the branch edit and resubmit. See
 * justification-actions.ts for the enforced order and justifications.ts
 * for the 3-day grace period this `overdue` flag reflects. */
export function JustificationBox({
  docNo,
  viewerRole,
  status,
  branchNote,
  branchResolution,
  branchNewRo,
  regionalNote,
  overdue,
}: {
  docNo: string;
  viewerRole: "hq" | "branch" | "regional";
  status: JustificationStatus;
  branchNote: string | null;
  branchResolution: BranchResolution | null;
  branchNewRo: string | null;
  regionalNote: string | null;
  overdue: boolean;
}) {
  const [branchState, branchAction, branchPending] = useActionState(submitBranchJustificationAction, INIT);
  const [regionalState, regionalAction, regionalPending] = useActionState(submitRegionalJustificationAction, INIT);
  const [resolution, setResolution] = useState<BranchResolution | "">(branchResolution ?? "");

  const branchSummary =
    branchResolution ? (
      <div className="text-fg-muted">
        <span className="text-fg-faint">Branch:</span> {RESOLUTION_LABEL[branchResolution]}
        {branchResolution === "ro_cancelled" && branchNewRo ? <> — new RO <span className="text-fg">{branchNewRo}</span></> : null}
        {branchNote ? <div className="mt-0.5">{branchNote}</div> : null}
      </div>
    ) : null;

  if (status === "resolved") {
    return (
      <div className="mt-2 border-t border-border-subtle pt-2 text-[12px]">
        <span className="font-medium text-good">Justified — approved</span>
        <div className="mt-1 space-y-1">
          {branchSummary}
          <div className="text-fg-muted">
            <span className="text-fg-faint">Regional:</span> {regionalNote}
          </div>
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="mt-2 border-t border-border-subtle pt-2 text-[12px]">
        <span className="font-medium text-bad">Rejected by regional</span>
        <div className="mt-1 space-y-1">
          {branchSummary}
          <div className="text-fg-muted">
            <span className="text-fg-faint">Regional:</span> {regionalNote}
          </div>
        </div>
        {viewerRole === "branch" ? (
          <BranchForm
            docNo={docNo}
            action={branchAction}
            pending={branchPending}
            state={branchState}
            resolution={resolution}
            setResolution={setResolution}
            defaultNote={branchNote}
            defaultNewRo={branchNewRo}
            submitLabel="Resubmit"
          />
        ) : null}
      </div>
    );
  }

  if (status === "branch_submitted") {
    return (
      <div className="mt-2 border-t border-border-subtle pt-2 text-[12px]">
        {branchSummary}
        {viewerRole === "regional" ? (
          <form action={regionalAction} className="mt-1.5 space-y-1.5">
            <input type="hidden" name="docNo" value={docNo} />
            <textarea name="note" required rows={2} placeholder="Your review note…" className={textareaClass} />
            <div className="flex items-center gap-1.5">
              <button type="submit" name="decision" value="approved" disabled={regionalPending} className={buttonClass}>
                {regionalPending ? "Saving…" : "Approve"}
              </button>
              <button type="submit" name="decision" value="rejected" disabled={regionalPending} className={rejectButtonClass}>
                {regionalPending ? "Saving…" : "Reject"}
              </button>
              {regionalState.error ? <span className="ml-1 text-[11px] text-bad">{regionalState.error}</span> : null}
            </div>
          </form>
        ) : (
          <div className={overdue ? "mt-1 font-medium text-bad" : "mt-1 text-fg-faint"}>
            {overdue ? "Overdue — still awaiting regional review" : "Awaiting regional review"}
          </div>
        )}
      </div>
    );
  }

  // status === "none"
  if (viewerRole === "branch") {
    return (
      <div className="mt-2 border-t border-border-subtle pt-2">
        <BranchForm
          docNo={docNo}
          action={branchAction}
          pending={branchPending}
          state={branchState}
          resolution={resolution}
          setResolution={setResolution}
          defaultNote={branchNote}
          defaultNewRo={branchNewRo}
          submitLabel="Submit justification"
        />
      </div>
    );
  }

  return (
    <div
      className={`mt-2 border-t border-border-subtle pt-2 text-[12px] ${overdue ? "font-medium text-bad" : "text-fg-faint"}`}
    >
      {overdue ? "Overdue — no justification yet (escalated to HQ)" : "Awaiting branch justification"}
    </div>
  );
}

function BranchForm({
  docNo,
  action,
  pending,
  state,
  resolution,
  setResolution,
  defaultNote,
  defaultNewRo,
  submitLabel,
}: {
  docNo: string;
  action: (formData: FormData) => void;
  pending: boolean;
  state: JustificationActionState;
  resolution: BranchResolution | "";
  setResolution: (r: BranchResolution | "") => void;
  defaultNote: string | null;
  defaultNewRo: string | null;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="docNo" value={docNo} />
      <select
        name="resolution"
        required
        value={resolution}
        onChange={(e) => setResolution(e.target.value as BranchResolution)}
        className={selectClass}
      >
        <option value="" disabled>
          Reason…
        </option>
        <option value="ro_cancelled">{RESOLUTION_LABEL.ro_cancelled}</option>
        <option value="still_not_closed">{RESOLUTION_LABEL.still_not_closed}</option>
      </select>
      {resolution === "ro_cancelled" ? (
        <input
          type="text"
          name="newRo"
          required
          defaultValue={defaultNewRo ?? ""}
          placeholder="New RO number (e.g. GSJ2613637)"
          className={inputClass}
        />
      ) : null}
      <textarea name="note" required rows={2} defaultValue={defaultNote ?? ""} placeholder="Remark…" className={textareaClass} />
      <div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : submitLabel}
        </button>
        {state.error ? <span className="ml-2 text-[11px] text-bad">{state.error}</span> : null}
        {!state.error && state.warning ? <div className="mt-1 text-[11px] text-fg-subtle">{state.warning}</div> : null}
      </div>
    </form>
  );
}
