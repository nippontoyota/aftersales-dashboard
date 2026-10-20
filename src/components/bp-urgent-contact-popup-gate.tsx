"use client";

import { useActionState, useEffect, useState } from "react";
import {
  getMyUrgentUnconnectedAction,
  markNotConnectedAction,
  type BpmActionState,
} from "@/app/bp-referrals/bpm-actions";
import { branchName } from "@/lib/branch-names";
import { NotConnectedReasonFields } from "@/app/bp-referrals/not-connected-reason-fields";

type UrgentReferral = {
  id: number;
  referring_employee_name: string | null;
  customer_phone: string | null;
  vehicle_reg_no: string | null;
  last_contacted_at: Date | string | null;
  submitted_at: Date | string | null;
  assigned_branch: string | null;
  call_status: "pending" | "not_connected" | "connected";
};

/** How often this popup is allowed to re-interrupt — 8 hours, approximating
 * the user's "3 times a day" ask without needing real clock-based scheduling
 * (this app has no cron/background jobs; everything is request-time). Not
 * gated by login_marker like the other pop-ups, since a BPM who stays logged
 * in all day still needs the nudge — gated by this cooldown instead, checked
 * on every page load. */
const REMIND_COOLDOWN_HOURS = 8;
const LAST_SHOWN_KEY = "bp_urgent_popup_last_shown_at";
const INIT: BpmActionState = { error: null, ok: false };

function hoursSince(ts: number): number {
  return (Date.now() - ts) / (1000 * 60 * 60);
}

function elapsedLabel(ts: Date | string | null): string {
  if (!ts) return "—";
  const then = new Date(ts as string).getTime();
  if (isNaN(then)) return "—";
  const hours = Math.floor((Date.now() - then) / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * The urgent first-contact nudge (2026-10-15) — a referral that's never
 * been reached (still "to call") or was tried and missed ("not connected")
 * gets its first reminder UNCONNECTED_REMINDER_HOURS (2h) after it last had
 * any activity, then keeps resurfacing roughly every REMIND_COOLDOWN_HOURS
 * until either it's resolved or UNCONNECTED_DROP_DAYS (3 days) pass, at
 * which point it's classified "Dropped" instead (see classify() in
 * bpm-queue-client.tsx) and this popup stops nagging about it.
 *
 * Deliberately a lighter-weight nag than the other pop-ups: no inline
 * outcome form, just "Not connected" (with its own required remark, same
 * as the queue page) plus a link to go handle it properly.
 */
export function BpUrgentContactPopupGate() {
  const [items, setItems] = useState<UrgentReferral[] | null>(null);
  const [index, setIndex] = useState(0);
  const [showRemark, setShowRemark] = useState(false);
  const [state, action, pending] = useActionState(markNotConnectedAction, INIT);

  useEffect(() => {
    let lastShown = 0;
    try {
      lastShown = Number(localStorage.getItem(LAST_SHOWN_KEY) ?? 0);
    } catch {
      // Private window / blocked storage — fall through, show every load.
    }
    if (lastShown && hoursSince(lastShown) < REMIND_COOLDOWN_HOURS) return;

    getMyUrgentUnconnectedAction()
      .then((rows) => {
        if (rows.length > 0) {
          setItems(rows);
          try {
            localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // Network hiccup — say nothing rather than block the page on it.
      });
  }, []);

  if (!items || items.length === 0) return null;
  const item = items[index];
  const isLast = index === items.length - 1;

  const advance = () => {
    setShowRemark(false);
    if (isLast) {
      setItems(null);
    } else {
      setIndex((i) => i + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-bad/30 bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full border border-bad/30 bg-bad-soft px-2 py-0.5 text-[11px] font-semibold text-bad">
            {items.length > 1 ? `Needs first contact ${index + 1} of ${items.length}` : "Needs first contact"}
          </span>
          <span className="text-[11px] text-fg-faint">{elapsedLabel(item.last_contacted_at ?? item.submitted_at)} since last attempt</span>
        </div>

        <h3 className="mt-3 text-base font-bold text-fg">{item.referring_employee_name ? `Referral — ${item.referring_employee_name}` : "Referral"}</h3>
        <p className="mt-1 text-xs text-fg-faint">{branchName(item.assigned_branch ?? "")}</p>

        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-fg-faint">Customer phone</dt>
            <dd className="font-semibold text-fg">{item.customer_phone ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-fg-faint">Vehicle reg</dt>
            <dd className="font-mono text-fg">{item.vehicle_reg_no ?? "—"}</dd>
          </div>
        </dl>

        <p className="mt-4 rounded-md border border-bad/30 bg-bad-soft/50 px-3 py-2 text-[12px] text-bad">
          {item.call_status === "not_connected"
            ? "Still hasn't been reached — give it another try. 3 days with no contact and this drops out of the active queue."
            : "No attempt logged yet — give this one a call. 3 days with no contact and this drops out of the active queue."}
        </p>

        {!showRemark ? (
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={advance} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2">
              {isLast ? "Remind me later" : "Next"}
            </button>
            <button
              type="button"
              onClick={() => setShowRemark(true)}
              className="rounded-md bg-bad-solid px-3 py-1.5 text-xs font-semibold text-on-accent hover:opacity-90"
            >
              Mark not connected
            </button>
            <a
              href="/bp-referrals"
              onClick={advance}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover"
            >
              Go handle it
            </a>
          </div>
        ) : (
          <form
            action={async (fd) => {
              await action(fd);
              advance();
            }}
            className="mt-3"
          >
            <input type="hidden" name="id" value={item.id} />
            <NotConnectedReasonFields textareaClassName="mt-1 w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" />
            {state.error ? <p className="mt-1 text-xs text-bad">{state.error}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowRemark(false)} className="text-xs text-fg-muted hover:underline">
                Back
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-bad-solid px-3 py-1.5 text-xs font-semibold text-on-accent hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
