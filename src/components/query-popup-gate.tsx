"use client";

import { useEffect, useState } from "react";
import { getMyOpenQueriesForPopupAction } from "@/app/queries/region-query-actions";
import type { RegionQuery } from "@/lib/region-queries/store";

const SEEN_MARKER_KEY = "queries_popup_seen_marker";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

/**
 * Login pop-up for an open query addressed to this viewer (branch admin or
 * regional manager) — 2026-09-26, at HQ's request: a passive nav badge is
 * too easy to miss, so this interrupts once per fresh login instead.
 *
 * Mounted unconditionally in AppShell for every role — harmless for HQ/VP/
 * CEO/Accounts, since getMyOpenQueriesForPopupAction returns [] for them.
 * No prop-threading needed per page (the usual AppShell gotcha, since it's
 * called fresh on every page.tsx) because this component decides for
 * itself, server-side, whether there's anything to show.
 *
 * "Fresh login" is detected via the login_marker cookie (see auth.ts) —
 * its value changes every time createSession() runs, so comparing it
 * against what's stored in localStorage tells apart "just logged in" from
 * "navigating between pages in the same session" without needing a new
 * server-side concept of session identity. Once shown (or dismissed) for a
 * given marker, it stays quiet for the rest of that login and reappears
 * only on the next one — and only if the query is still open.
 */
export function QueryPopupGate() {
  const [queries, setQueries] = useState<RegionQuery[] | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const marker = readCookie("login_marker");
    if (!marker) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_MARKER_KEY);
    } catch {
      // Private window / blocked storage — fall through and show it every
      // page load rather than crash; better an occasional repeat than silence.
    }
    if (marker === seen) return;

    getMyOpenQueriesForPopupAction()
      .then((rows) => {
        if (rows.length > 0) setQueries(rows);
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

  if (!queries || queries.length === 0) return null;
  const query = queries[index];
  const isLast = index === queries.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full border border-warn/30 bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
            {queries.length > 1 ? `Query ${index + 1} of ${queries.length}` : "Open query"}
          </span>
          <span className="text-[11px] text-fg-faint">{when(query.createdAt)}</span>
        </div>

        {(query.contextDate || query.contextBranch) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {query.contextDate ? (
              <span className="rounded border border-border-subtle bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-subtle">
                Date {query.contextDate}
              </span>
            ) : null}
            {query.direction !== "to_branch" && query.contextBranch ? (
              <span className="rounded border border-border-subtle bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-subtle">
                Branch {query.contextBranch}
              </span>
            ) : null}
          </div>
        )}

        <p className="mt-3 whitespace-pre-wrap text-sm text-fg">{query.note}</p>

        <p className="mt-4 rounded-md border border-info/30 bg-info-soft/50 px-3 py-2 text-[12px] text-info">
          Once you&apos;ve sorted this, go to <strong>Queries</strong> and click <strong>Mark resolved</strong> — that&apos;s what
          stops this reminder from coming back.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => (isLast ? setQueries(null) : setIndex((i) => i + 1))}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2"
          >
            {isLast ? "Remind me later" : "Next"}
          </button>
          <a
            href="/queries"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover"
            onClick={() => setQueries(null)}
          >
            Go to Queries now
          </a>
        </div>
      </div>
    </div>
  );
}
