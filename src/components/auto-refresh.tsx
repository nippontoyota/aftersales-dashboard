"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Added 2026-09-28. Every page on this app is a Server Component that only
 * re-fetches on a new request, so a tab left open never sees data someone
 * else changed (a new upload, a query reply) until it's manually reloaded.
 * This calls `router.refresh()` when the tab regains visibility (switched
 * back to, or the window refocused), which re-runs the current route's
 * Server Components with fresh data and reconciles the DOM — no full page
 * reload, no lost scroll position.
 *
 * Previously also polled on a 30s timer regardless of focus — removed
 * 2026-10-10 after it turned out to be the dominant source of Vercel
 * function invocations/Active CPU (every page, every open tab, every 30s,
 * all day), dwarfing actual upload traffic. Refresh-on-return covers the
 * "stale tab" problem without the unconditional background cost.
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

    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router]);

  return null;
}
