"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "labour_sales_intro_seen";

/**
 * One-time rollout announcement for the Labour Sales Report upload, live
 * for every branch from 2026-10-09 (see labour-sales/parse.ts). Unlike
 * HolidayMergePopupGate's date-keyed localStorage marker (deliberately
 * reappears day over day while still relevant), this is a single
 * announcement with no recurring condition behind it, so the marker has no
 * date component — once dismissed, it never shows again on that browser.
 * Mounted only for the branch role (see app-shell.tsx).
 */
export function LabourSalesIntroPopupGate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alreadySeen = false;
    try {
      alreadySeen = localStorage.getItem(SEEN_KEY) !== null;
    } catch {
      // Private window / blocked storage — show it rather than crash.
    }
    // Deferred to a microtask rather than called directly in the effect body
    // (react-hooks/set-state-in-effect) — same shape as HolidayMergePopupGate's
    // own .then()-wrapped setState, just with no real async work to hang it off.
    if (!alreadySeen) Promise.resolve().then(() => setShow(true));
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore — see above
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <span className="rounded-full border border-info/30 bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info">
          New: Labour Sales Report
        </span>

        <p className="mt-3 text-sm text-fg">
          Starting today, you can upload the Labour Sales Report along with your other daily reports. For{" "}
          <strong>today&apos;s upload</strong>, include everything from <strong>1 Oct to 8 Oct in one file</strong>. From{" "}
          <strong>tomorrow onwards</strong>, upload it daily, one day at a time, like your other reports.
        </p>
        <p className="mt-2 text-sm text-fg-subtle">
          This doesn&apos;t change any figures on your dashboard yet — it&apos;s just being collected for now.
        </p>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
