"use client";

import { useActionState } from "react";
import { control } from "@/lib/ui";
import { branchName } from "@/lib/branch-names";
import { assignBranchAction, rescanUnmatchedReferralsAction, type BpHoActionState, type RescanState } from "./bp-ho-actions";

const ASSIGN_INIT: BpHoActionState = { error: null, ok: false };

/** BP HO manually resolving a referral whose free-text branch never
 * matched anything — shared by the main referral table and the KPI
 * slide-over, so an unassigned row looks and behaves the same everywhere
 * it shows up. */
export function AssignBranchForm({ referralId, branchCodes }: { referralId: number; branchCodes: string[] }) {
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

/** The RO-match backstop button — re-checks every BPM-entered pending RO
 * number against every saved Cost & Sales Report - BP row, not just the next
 * upload (2026-10-26: repurposed from the old blind reg-no scan — see
 * ro-matcher.ts's rescanUnmatchedReferrals()). */
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
