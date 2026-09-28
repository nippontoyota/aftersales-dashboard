"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_INTERVAL_MS = 30_000;

/**
 * Trial (2026-09-28, not yet decided whether to keep) — every page on this
 * app is a Server Component that only re-fetches on a new request, so a tab
 * left open never sees data someone else changed (a new upload, a query
 * reply) until it's manually reloaded. This polls `router.refresh()` every
 * 30s while the tab is visible, which re-runs the current route's Server
 * Components with fresh data and reconciles the DOM — no full page reload,
 * no lost scroll position. Also refreshes immediately on regaining focus
 * (tab switch back) rather than waiting out the rest of the interval.
 *
 * Deliberately unconditional (no "did anything actually change" check
 * first) — keeping that signal accurate would mean tracking every table
 * that can change (uploads, queries, bills, cancellations, targets...),
 * and a missed one would silently make a page look fresh when it isn't.
 * At this company's scale the extra database load from refreshing
 * unconditionally is negligible.
 *
 * Mounted once in AppShell (same pattern as QueryPopupGate) — covers every
 * page automatically, no per-page prop threading needed.
 */
export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    const id = setInterval(refreshIfVisible, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router]);

  return null;
}
