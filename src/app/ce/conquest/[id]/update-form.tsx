"use client";

import { useActionState, useState } from "react";
import {
  CONNECTED_OUTCOMES,
  NOT_CONNECTED_OUTCOMES,
  indiaDate,
  outcomeNeedsDate,
  type CeCallOutcome,
  type CeCallStatus,
} from "@/lib/ce/rules";
import { updateConquestLeadAction, type CeConquestUpdateState } from "../actions";
import { HolidayDatePicker } from "../../leads/[vin]/holiday-date-picker";

const initial: CeConquestUpdateState = { error: null, success: false };

/** Same call-log form as the MRS lead detail page's UpdateForm, minus the
 * "MRS follow-up already scheduled" shortcut — meaningless here, since a
 * conquest lead was never on an MRS list to begin with. */
export function UpdateForm({ id, attemptCount, holidays }: { id: string; attemptCount: number; holidays: string[] }) {
  const action = updateConquestLeadAction.bind(null, id);
  const [state, formAction, pending] = useActionState(action, initial);
  const [callStatus, setCallStatus] = useState<CeCallStatus>("connected");
  const [outcome, setOutcome] = useState<CeCallOutcome | "">("");
  const [followUpDate, setFollowUpDate] = useState<string | null>(null);
  const outcomes = callStatus === "connected" ? CONNECTED_OUTCOMES : NOT_CONNECTED_OUTCOMES;
  const nextAttempt = Math.min(5, attemptCount + 1);
  const today = indiaDate();
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const earliestDate = tomorrow.toISOString().slice(0, 10);
  const holidaySet = new Set(holidays);

  function chooseCallStatus(value: CeCallStatus) {
    setCallStatus(value);
    setOutcome("");
    setFollowUpDate(null);
  }

  function chooseOutcome(value: CeCallOutcome) {
    setOutcome(value);
    setFollowUpDate(null);
  }

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-fg-muted">Call attempt</span>
          <span className="text-[10px] text-fg-faint">{attemptCount < 5 ? `Next: F${nextAttempt}` : "Further calls stay on F5"}</span>
        </div>
        <ol className="mt-2 grid grid-cols-5 gap-1" aria-label={`${attemptCount} of 5 call attempts recorded`}>
          {[1, 2, 3, 4, 5].map((step) => {
            const recorded = step <= attemptCount;
            const current = step === nextAttempt;
            return (
              <li
                key={step}
                aria-current={current ? "step" : undefined}
                className={`rounded-md border px-1 py-1.5 text-center text-[11px] font-semibold tabular-nums ${
                  recorded
                    ? "border-accent bg-accent text-on-accent"
                    : current
                      ? "border-accent bg-accent-soft text-accent-text"
                      : "border-border bg-surface-2 text-fg-faint"
                }`}
              >
                F{step}
              </li>
            );
          })}
        </ol>
      </div>

      <fieldset>
        <legend className="text-xs font-medium text-fg-muted">Call status</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["connected", "not_connected"] as const).map((value) => (
            <label key={value} className="cursor-pointer">
              <input
                className="peer sr-only"
                type="radio"
                name="callStatus"
                value={value}
                checked={callStatus === value}
                onChange={() => chooseCallStatus(value)}
                required
              />
              <span className="flex min-h-9 items-center justify-center rounded-md border border-border-strong bg-surface px-2 text-center text-xs font-medium text-fg-muted transition hover:bg-surface-2 peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-text peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                {value === "connected" ? "Connected" : "Not connected"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-medium text-fg-muted">Outcome</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {outcomes.map((item) => (
            <label key={item} className="cursor-pointer">
              <input
                className="peer sr-only"
                type="radio"
                name="outcome"
                value={item}
                checked={outcome === item}
                onChange={() => chooseOutcome(item)}
                required
              />
              <span className="flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-2.5 py-2 text-xs leading-snug text-fg-muted transition hover:bg-surface-2 peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-medium peer-checked:text-accent-text peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                {item}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {outcome && outcomeNeedsDate(outcome) ? (
        <HolidayDatePicker
          name="nextFollowUpDate"
          label={outcome === "Appointment booked" ? "Appointment date" : "Next follow-up"}
          valueIso={followUpDate}
          onChangeIso={setFollowUpDate}
          minIso={earliestDate}
          holidays={holidaySet}
        />
      ) : null}

      <label>
        <span className="block text-xs font-medium text-fg-muted">What did the customer say?</span>
        <textarea name="note" required maxLength={2000} rows={4} placeholder="Record the customer's response" className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
      </label>
      {state.error ? <p role="alert" className="text-sm text-bad">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm text-good">Call result saved and activity recorded.</p> : null}
      <button disabled={pending} className="h-9 w-full rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60">
        {pending ? "Saving…" : `Save F${nextAttempt} call`}
      </button>
    </form>
  );
}
