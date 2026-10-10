"use client";

import { useActionState } from "react";
import { submitBranchJustificationAction, submitRegionalJustificationAction, type JustificationActionState } from "./justification-actions";
import type { JustificationStatus } from "@/lib/cancellation/justifications";

const INIT: JustificationActionState = { error: null, ok: false };

const textareaClass =
  "w-full rounded-md border border-border-strong bg-surface px-2 py-1 text-[12px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const buttonClass =
  "rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60";

/**
 * Inline justification control on a flagged cancellation row — branch
 * submits first, their regional manager co-signs on top of it, HQ sees it
 * read-only. See justification-actions.ts for the enforced order and
 * justifications.ts for the 3-day grace period this `overdue` flag reflects.
 */
export function JustificationBox({
  docNo,
  viewerRole,
  status,
  branchNote,
  regionalNote,
  overdue,
}: {
  docNo: string;
  viewerRole: "hq" | "branch" | "regional";
  status: JustificationStatus;
  branchNote: string | null;
  regionalNote: string | null;
  overdue: boolean;
}) {
  const [branchState, branchAction, branchPending] = useActionState(submitBranchJustificationAction, INIT);
  const [regionalState, regionalAction, regionalPending] = useActionState(submitRegionalJustificationAction, INIT);

  if (status === "resolved") {
    return (
      <div className="mt-2 border-t border-border-subtle pt-2 text-[12px]">
        <span className="font-medium text-good">Justified</span>
        <div className="mt-1 text-fg-muted">
          <span className="text-fg-faint">Branch:</span> {branchNote}
        </div>
        <div className="text-fg-muted">
          <span className="text-fg-faint">Regional:</span> {regionalNote}
        </div>
      </div>
    );
  }

  if (status === "branch_submitted") {
    return (
      <div className="mt-2 border-t border-border-subtle pt-2 text-[12px]">
        <div className="text-fg-muted">
          <span className="text-fg-faint">Branch:</span> {branchNote}
        </div>
        {viewerRole === "regional" ? (
          <form action={regionalAction} className="mt-1.5 space-y-1.5">
            <input type="hidden" name="docNo" value={docNo} />
            <textarea name="note" required rows={2} placeholder="Your co-sign note…" className={textareaClass} />
            <div>
              <button type="submit" disabled={regionalPending} className={buttonClass}>
                {regionalPending ? "Saving…" : "Co-sign"}
              </button>
              {regionalState.error ? <span className="ml-2 text-[11px] text-bad">{regionalState.error}</span> : null}
            </div>
          </form>
        ) : (
          <div className={overdue ? "mt-1 font-medium text-bad" : "mt-1 text-fg-faint"}>
            {overdue ? "Overdue — still awaiting regional sign-off" : "Awaiting regional sign-off"}
          </div>
        )}
      </div>
    );
  }

  // status === "none"
  if (viewerRole === "branch") {
    return (
      <form action={branchAction} className="mt-2 space-y-1.5 border-t border-border-subtle pt-2">
        <input type="hidden" name="docNo" value={docNo} />
        <textarea name="note" required rows={2} placeholder="Why is this still unresolved?" className={textareaClass} />
        <div>
          <button type="submit" disabled={branchPending} className={buttonClass}>
            {branchPending ? "Saving…" : "Submit justification"}
          </button>
          {branchState.error ? <span className="ml-2 text-[11px] text-bad">{branchState.error}</span> : null}
        </div>
      </form>
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
