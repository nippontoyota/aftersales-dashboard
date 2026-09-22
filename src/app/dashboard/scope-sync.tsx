"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Shared branch/region scope for Executive Overview — the Hero Figures
 * strip's own switcher, the Revenue per Car leaderboard, and the VAS trend
 * chart all read/write the same value once wrapped in <ScopeSyncProvider>,
 * so picking a branch/region there now drives all three at once (2026-09-22,
 * at the user's request — the page header's separate region dropdown was
 * removed for being a second "All" control doing an overlapping job; this
 * is what replaced it as the page's one live scope control). Same
 * fallback-to-private-local-state pattern as metric-sync.tsx: outside a
 * provider (nowhere today, but kept consistent), each consumer just gets its
 * own independent state.
 */
type ScopeSync = { scope: string; setScope: (value: string) => void };

const ScopeSyncContext = createContext<ScopeSync | null>(null);

export function ScopeSyncProvider({ initialScope, children }: { initialScope: string; children: ReactNode }) {
  const [scope, setScope] = useState(initialScope);
  return <ScopeSyncContext.Provider value={{ scope, setScope }}>{children}</ScopeSyncContext.Provider>;
}

/** `[scope, setScope]` from the surrounding ScopeSyncProvider if there is one, otherwise a private `useState` seeded with `fallback`. */
export function useSyncedScope(fallback: string): [string, (value: string) => void] {
  const shared = useContext(ScopeSyncContext);
  const local = useState(fallback);
  return shared ? [shared.scope, shared.setScope] : local;
}
