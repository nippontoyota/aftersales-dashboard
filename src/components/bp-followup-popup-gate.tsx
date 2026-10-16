"use client";

import { useActionState, useEffect, useState } from "react";
import {
  getMyOverdueFollowUpsAction,
  logFollowUpContactAction,
  type BpmActionState,
} from "@/app/bp-referrals/bpm-actions";
import { branchName } from "@/lib/branch-names";

type OverdueReferral = {
  id: number;
  referring_employee_name: string | null;
  customer_phone: string | null;
  vehicle_reg_no: string | null;
  estimate_amount: string | null;
  last_contacted_at: Date | string | null;
  assigned_branch: string | null;
};

const SEEN_MARKER_KEY = "bp_followup_popup_seen_marker";
const INIT: BpmActionState = { error: null, ok: false };

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function hoursSince(ts: Date | string | null): number {
  if (!ts) return 0;
  const then = new Date(ts as string).getTime();
  if (isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60));
}

/**
 * Login pop-up for a BP Manager with validated (genuine + interested)
 * referrals that haven't had a follow-up call in 24+ hours (2026-10-15,
 * tightened from 3 days at the user's request) and whose car still hasn't
 * come in.
 *
 * Mounted unconditionally in BpShell for every BP role — harmless for BP
 * HO, since getMyOverdueFollowUpsAction returns [] for anyone but
 * bp_manager (same "decides for itself, server-side" convention as
 * QueryPopupGate). Same once-per-fresh-login suppression via the
 * login_marker cookie, under its own storage key so it doesn't collide
 * with the Queries pop-up's marker.
 */
export function BpFollowUpPopupGate() {
  const [items, setItems] = useState<OverdueReferral[] | null>(null);
  const [index, setIndex] = useState(0);
  const [logState, logAction, logPending] = useActionState(logFollowUpContactAction, INIT);

  useEffect(() => {
    const marker = readCookie("login_marker");
    if (!marker) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_MARKER_KEY);
    } catch {
      // Private window / blocked storage — show it every page load rather
      // than crash; better an occasional repeat than silence.
    }
    if (marker === seen) return;

    getMyOverdueFollowUpsAction()
      .then((rows) => {
        if (rows.length > 0) setItems(rows);
        try {
          localStorage.setItem(SEEN_MARKER_KEY, marker);
        } catch {
          // ignore — see above
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
    if (isLast) {
      setItems(null);
    } else {
      setIndex((i) => i + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full border border-warn/30 bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
            {items.length > 1 ? `Follow-up ${index + 1} of ${items.length}` : "Follow-up due"}
          </span>
          <span className="text-[11px] text-fg-faint">{hoursSince(item.last_contacted_at)}h since last contact</span>
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
          {item.estimate_amount != null ? (
            <div className="flex justify-between gap-3">
              <dt className="text-fg-faint">Estimate</dt>
              <dd className="text-fg">₹{Number(item.estimate_amount).toLocaleString("en-IN")}</dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-4 rounded-md border border-info/30 bg-info-soft/50 px-3 py-2 text-[12px] text-info">
          Call to check in — still planning to bring the car in?
        </p>

        <form
          action={async (fd) => {
            await logAction(fd);
            advance();
          }}
          className="mt-3"
        >
          <input type="hidden" name="id" value={item.id} />
          <label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Remark (required)</label>
          <textarea
            name="remark"
            required
            rows={2}
            placeholder="What did the customer say?"
            className="mt-1 w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          {logState.error ? <p className="mt-1 text-xs text-bad">{logState.error}</p> : null}

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={advance} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2">
              {isLast ? "Remind me later" : "Next"}
            </button>
            <button
              type="submit"
              disabled={logPending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
            >
              {logPending ? "Saving…" : "Spoke to them — reset reminder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
