"use client";

import { useEffect, useState } from "react";
import { acknowledgeMyPendingAdjustmentsAction, getMyPendingAdjustmentAcksAction } from "@/app/cancellations/adjustment-ack-actions";
import type { PendingAdjustmentAck } from "@/lib/cancellation/adjustment-acks";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
};

/**
 * Branch/regional-only popup for a cross-month adjustment they haven't seen
 * yet (see adjustment-acks.ts) — so a branch (or its regional manager)
 * finds out a cancellation of theirs was cross-month-adjusted without
 * having to go looking on /cancellations. Unlike QueryPopupGate's
 * once-per-login localStorage marker, this is tracked server-side per
 * adjustment: it reappears on every page load until "Got it" is clicked,
 * and never again once it is (per the user's explicit call — 2026-10-07).
 * Mounted unconditionally in AppShell; harmless for every other role, since
 * getMyPendingAdjustmentAcksAction returns [] for them.
 */
export function AdjustmentAckPopupGate() {
  const [pending, setPending] = useState<PendingAdjustmentAck[] | null>(null);
  const [acking, setAcking] = useState(false);

  useEffect(() => {
    getMyPendingAdjustmentAcksAction()
      .then((rows) => {
        if (rows.length > 0) setPending(rows);
      })
      .catch(() => {
        // Network hiccup — say nothing rather than block the page on it.
      });
  }, []);

  if (!pending || pending.length === 0) return null;

  const gotIt = () => {
    setAcking(true);
    acknowledgeMyPendingAdjustmentsAction()
      .then(() => setPending(null))
      .catch(() => setAcking(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <span className="rounded-full border border-warn/30 bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
          Cross-month adjustment{pending.length > 1 ? "s" : ""}
        </span>

        <p className="mt-3 text-sm text-fg">
          {pending.length === 1 ? "A cancelled invoice of yours was" : `${pending.length} cancelled invoices of yours were`} re-invoiced
          under a new invoice number in a later month, and the figures have been adjusted so that job&apos;s revenue is only counted once.
        </p>

        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {pending.map((p) => {
            const excludedPart = p.usingOriginalValue ? p.originalPartSale! : p.partSale;
            const excludedLabour = p.usingOriginalValue ? p.originalLabourSale! : p.labourSale;
            return (
              <li key={`${p.branch}|${p.cancelledDocNo}|${p.replacementDocNo}`} className="rounded-md border border-border-subtle bg-surface-2 p-2.5 text-[13px]">
                <div className="font-medium text-fg">
                  {p.branch} · {p.cancelledDocNo} {p.refDocNo ? `(RO ${p.refDocNo})` : ""}
                </div>
                <div className="mt-0.5 text-fg-muted">
                  Replaced by {p.replacementDocNo} in {monthLabel(p.replacementMonth)} — {inr(excludedPart + excludedLabour)} excluded from
                  that month ({inr(excludedPart)} parts, {inr(excludedLabour)} labour)
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 rounded-md border border-info/30 bg-info-soft/50 px-3 py-2 text-[12px] text-info">
          Full detail is always on <strong>Cancellations → Cross-month replacements</strong>.
        </p>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={gotIt}
            disabled={acking}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
          >
            {acking ? "Saving…" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
