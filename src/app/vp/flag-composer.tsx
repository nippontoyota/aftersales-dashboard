"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect } from "react";
import { raiseVpFlagAction, type FlagState } from "./actions";

/**
 * The "raise a query to HQ" composer. Shown as a modal whenever `?flag=1`
 * is in the URL — a header button or any row's flag icon just links there
 * with the context pre-filled (`&metric=…&branch=…`). Closing it strips the
 * flag params. Read-only VP → HQ; the reply comes back on /vp/queries.
 */
export function FlagComposer({
  page,
  date,
}: {
  page: "overview" | "region" | "branch";
  date: string;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const open = params.get("flag") === "1";

  const [state, formAction, pending] = useActionState<FlagState, FormData>(raiseVpFlagAction, {
    error: null,
    ok: false,
  });

  const closeHref = (() => {
    const p = new URLSearchParams(params);
    for (const k of ["flag", "fmetric", "fvalue", "fbranch", "fregion"]) p.delete(k);
    const q = p.toString();
    return q ? `${pathname}?${q}` : pathname;
  })();

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => router.push(closeHref), 1400);
      return () => clearTimeout(t);
    }
  }, [state.ok, router, closeHref]);

  if (!open) return null;

  const metric = params.get("fmetric") ?? "";
  const value = params.get("fvalue") ?? "";
  const branch = params.get("fbranch") ?? "";
  const region = params.get("fregion") ?? "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <Link href={closeHref} className="absolute inset-0 bg-black/50" aria-label="Cancel" />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg">
        <h2 className="text-sm font-semibold text-fg">Raise a query to HQ</h2>
        <p className="mt-1 text-[12px] text-fg-faint">
          {[
            metric && `Metric: ${metric}`,
            branch && `Branch: ${branch}`,
            region && `Region: ${region}`,
            `Date: ${date}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {state.ok ? (
          <div className="mt-4 rounded-md border border-good/30 bg-good-soft px-3 py-2 text-sm text-good">
            Sent to HQ. You&apos;ll see the reply under Queries.
          </div>
        ) : (
          <form action={formAction} className="mt-3 space-y-3">
            <input type="hidden" name="page" value={page} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="region" value={region} />
            <input type="hidden" name="branch" value={branch} />
            <input type="hidden" name="metric" value={metric} />
            <input type="hidden" name="value" value={value} />
            <textarea
              name="note"
              required
              rows={4}
              autoFocus
              placeholder="What would you like HQ to check or explain?"
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            {state.error ? <p className="text-[12px] text-bad">{state.error}</p> : null}
            <div className="flex justify-end gap-2">
              <Link
                href={closeHref}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send to HQ"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Header "Raise a query" button — a link that opens the composer. Present
 * on every /vp page (see vp-header.tsx). */
export function RaiseQueryButton({ flagHref }: { flagHref: string }) {
  return (
    <Link
      href={flagHref}
      className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-text transition-colors hover:border-accent hover:bg-accent-soft/70 print:hidden"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M4 2v12M4 3h8l-1.5 2.5L12 8H4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Raise a query
    </Link>
  );
}
