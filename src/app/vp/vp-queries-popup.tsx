"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { VpQueryThread } from "@/lib/vp-flags/store";
import { VpFlagThread } from "./vp-flag-thread";

/**
 * The corner notifications popup (2026-09-26, replacing the old /vp/queries
 * nav tab and header "Raise a query" button — the VP's page has no nav at
 * all now, so this is the one always-available way in). A fixed
 * bottom-right launcher with an unread badge; opens a panel listing every
 * query the VP has raised, each recipient's own reply status, and a "New
 * query" link that opens the same flag-composer modal used by per-metric
 * flag icons, just with no context pre-filled.
 */
export function VpQueriesPopup({ threads, unreadCount }: { threads: VpQueryThread[]; unreadCount: number }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const params = useSearchParams();

  const newQueryHref = (() => {
    const p = new URLSearchParams(params);
    p.set("flag", "1");
    return `${pathname}?${p.toString()}`;
  })();

  const active = threads.filter((t) => !t.archived);
  const resolved = threads.filter((t) => t.archived);

  return (
    <div className="fixed bottom-5 right-5 z-40 print:hidden">
      {open ? (
        <div className="mb-3 max-h-[70vh] w-[380px] max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl">
          <div className="sticky top-0 flex items-center justify-between border-b border-border-subtle bg-surface px-4 py-3">
            <h2 className="text-sm font-semibold text-fg">Queries</h2>
            <div className="flex items-center gap-2">
              <Link
                href={newQueryHref}
                className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-on-accent hover:bg-accent-hover"
              >
                New query
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <path d="M3.5 3.5l9 9m0-9l-9 9" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-3">
            {threads.length === 0 ? (
              <p className="px-1 py-4 text-center text-[12.5px] text-fg-faint">
                No queries yet — raise one about any figure, or start a general one above.
              </p>
            ) : (
              <>
                <div className="space-y-2.5">
                  {active.map((t) => (
                    <VpFlagThread key={t.id} thread={t} viewerReplyableRecipientIds={new Set()} canManage />
                  ))}
                </div>
                {resolved.length > 0 ? (
                  <>
                    <h3 className="mt-4 px-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-faint">Resolved</h3>
                    <div className="mt-2 space-y-2.5">
                      {resolved.map((t) => (
                        <VpFlagThread key={t.id} thread={t} viewerReplyableRecipientIds={new Set()} canManage />
                      ))}
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Queries"
        className="relative flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-fg shadow-lg transition-colors hover:bg-surface-2"
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M4 4.5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-3.5 3v-3H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad-solid px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
