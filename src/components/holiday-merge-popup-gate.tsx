"use client";

import { useEffect, useState } from "react";
import { getPendingHolidayMergeAction } from "@/app/upload/holiday-merge-actions";
import type { PendingHolidayMerge } from "@/lib/report-holidays/store";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "UTC" });
}

function listText(dates: string[]): string {
  const formatted = dates.map(formatDate);
  if (formatted.length === 1) return formatted[0];
  return `${formatted.slice(0, -1).join(", ")} and ${formatted[formatted.length - 1]}`;
}

/**
 * Branch-only reminder for an HQ-flagged holiday that the canonical report
 * date has skipped (see pendingHolidaysToMerge()) — e.g. 2 Oct 2026 (Gandhi
 * Jayanti), where the round files under 1 Oct instead. Branches who worked
 * the holiday anyway need to fold that data into the canonical date rather
 * than upload it separately, which this interrupts to say before they reach
 * the upload form.
 *
 * Shown once per calendar day per distinct set of pending holidays (not
 * once-per-login like QueryPopupGate) — it reappears tomorrow if still
 * relevant, and stops on its own once the canonical date catches up past
 * the holiday. Mounted unconditionally in AppShell; harmless for non-branch
 * roles since getPendingHolidayMergeAction returns [] for them.
 */
export function HolidayMergePopupGate() {
  const [state, setState] = useState<{ canonicalDate: string; holidays: PendingHolidayMerge[] } | null>(null);

  useEffect(() => {
    getPendingHolidayMergeAction()
      .then((result) => {
        if (result.holidays.length === 0) return;
        const today = new Date().toISOString().slice(0, 10);
        const key = `holiday_merge_seen:${today}`;
        const dateList = result.holidays.map((h) => h.date).join(",");
        let seen: string | null = null;
        try {
          seen = localStorage.getItem(key);
        } catch {
          // Private window / blocked storage — show it rather than crash.
        }
        if (seen === dateList) return;
        setState(result);
        try {
          localStorage.setItem(key, dateList);
        } catch {
          // ignore — see above
        }
      })
      .catch(() => {
        // Network hiccup — say nothing rather than block the page on it.
      });
  }, []);

  if (!state) return null;

  const dates = state.holidays.map((h) => h.date);
  const notes = [...new Set(state.holidays.map((h) => h.note).filter((n): n is string => !!n))];
  const canonicalLabel = formatDate(state.canonicalDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <span className="rounded-full border border-warn/30 bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
          Holiday upload reminder
        </span>

        <p className="mt-3 text-sm text-fg">
          {notes.length > 0 ? notes.join(", ") : "A holiday"} on {listText(dates)} {dates.length === 1 ? "was" : "were"} a
          holiday — this round&apos;s upload is filed under <strong>{canonicalLabel}</strong>. If you have any files from{" "}
          {listText(dates)}, merge them into {canonicalLabel}&apos;s data before uploading. Don&apos;t upload them as a
          separate date.
        </p>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setState(null)}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
