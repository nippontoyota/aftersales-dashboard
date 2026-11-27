"use client";

import { useActionState } from "react";
import { markPayoutPaidAction, rescanUnmatchedReferralsAction, type MarkPaidState, type RescanState } from "./hq-actions";

const RESCAN_INIT: RescanState = { error: null, matchedCount: null };

export function RescanButton() {
  const [state, action, pending] = useActionState(rescanUnmatchedReferralsAction, RESCAN_INIT);
  return (
    <div className="flex items-center gap-2">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2 disabled:opacity-60"
        >
          {pending ? "Re-checking…" : "Re-check pending RO entries"}
        </button>
      </form>
      {state.matchedCount !== null ? (
        <span className="text-xs text-fg-muted">
          {state.matchedCount === 0 ? "No new matches found." : `Confirmed ${state.matchedCount} referral${state.matchedCount === 1 ? "" : "s"}.`}
        </span>
      ) : null}
      {state.error ? <span className="text-xs text-bad">{state.error}</span> : null}
    </div>
  );
}

const MARK_PAID_INIT: MarkPaidState = { error: null, ok: false };

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function MarkPaidButton({
  employeeId,
  employeeName,
  employeeBranch,
  amount,
}: {
  employeeId: string | null;
  employeeName: string | null;
  employeeBranch: string | null;
  amount: number;
}) {
  const [state, action, pending] = useActionState(markPayoutPaidAction, MARK_PAID_INIT);
  if (state.ok) return <span className="text-xs font-medium text-good">Paid ✓</span>;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Mark ${inr(amount)} as paid to ${employeeName ?? "this employee"}?`)) e.preventDefault();
      }}
      className="inline-flex items-center gap-1.5"
    >
      <input type="hidden" name="employeeId" value={employeeId ?? ""} />
      <input type="hidden" name="employeeName" value={employeeName ?? ""} />
      <input type="hidden" name="employeeBranch" value={employeeBranch ?? ""} />
      <input type="hidden" name="amount" value={amount} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border-strong px-2 py-1 text-xs font-medium text-fg-muted hover:bg-surface-2 disabled:opacity-60"
      >
        {pending ? "…" : "Mark paid"}
      </button>
      {state.error ? <span className="text-xs text-bad">{state.error}</span> : null}
    </form>
  );
}
