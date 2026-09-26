"use client";

import { useActionState, useEffect, useState } from "react";
import {
  raiseRegionQueryAction,
  raiseRegionQueryToBranchAction,
  raiseRegionQueryToRegionAction,
  replyRegionQueryAction,
  setRegionQueryStatusAction,
  type RegionQueryState,
} from "./region-query-actions";

const INIT: RegionQueryState = { error: null, ok: false };

const inputClass =
  "w-full rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** Reply box on a thread addressed to the viewer. */
export function ReplyForm({ id }: { id: number }) {
  const [state, action, pending] = useActionState(replyRegionQueryAction, INIT);
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="id" value={id} />
      <textarea name="reply" required rows={2} placeholder="Type your reply…" className={inputClass} />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-fg-muted">
          <input type="checkbox" name="close" className="accent-accent" /> close thread
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send reply"}
        </button>
        {state.error ? <span className="text-[12px] text-bad">{state.error}</span> : null}
      </div>
    </form>
  );
}

/** The asker toggling their own thread open/closed. */
export function StatusButton({ id, to, label }: { id: number; to: "open" | "closed"; label: string }) {
  const [state, action, pending] = useActionState(setRegionQueryStatusAction, INIT);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={to} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-2 py-1 text-[12px] font-medium text-fg-muted hover:bg-surface-2 disabled:opacity-60"
      >
        {pending ? "…" : label}
      </button>
      {state.error ? <span className="ml-2 text-[12px] text-bad">{state.error}</span> : null}
    </form>
  );
}

/** Shared chrome: a closed "Ask …" pill that expands into a small card, kept
 * closed by default so the page reads as a list of threads first, not a
 * form. `open`/`onClose` are controlled by the caller so it can auto-collapse
 * on success. */
function ComposerCard({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-fg">{label}</span>
        <button type="button" onClick={onClose} className="text-fg-faint hover:text-fg-muted" aria-label="Cancel">
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ComposerButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-text transition-colors hover:border-accent hover:bg-accent-soft/70"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M4 2v12M4 3h8l-1.5 2.5L12 8H4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}

/** A regional manager raising a question to HQ — date + optional branch (own region only) + note. */
export function RaiseToHqForm({ branches }: { branches: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(raiseRegionQueryAction, INIT);

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => setOpen(false), 1600);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  if (!open) return <ComposerButton label="Ask HQ a question" onClick={() => setOpen(true)} />;

  if (state.ok) {
    return (
      <div className="rounded-lg border border-good/30 bg-good-soft px-4 py-3 text-sm text-good">
        Sent to HQ — you&apos;ll see the reply here.
      </div>
    );
  }

  return (
    <ComposerCard label="Ask HQ a question" onClose={() => setOpen(false)}>
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input type="date" name="date" className={inputClass} />
          <select name="branch" defaultValue="" className={inputClass}>
            <option value="">No specific branch</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <textarea name="note" required rows={3} placeholder="What would you like HQ to check or explain?" className={inputClass} />
        {state.error ? <p className="text-[12px] text-bad">{state.error}</p> : null}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send to HQ"}
          </button>
        </div>
      </form>
    </ComposerCard>
  );
}

/** HQ or a regional manager raising a question to one specific branch
 * (2026-09-26) — private to that branch. `regions` drives the branch list;
 * when it has just one entry (a regional manager, their own region) the
 * region selector is skipped entirely — only `branch` is ever submitted,
 * the server derives the region from it. */
export function RaiseToBranchForm({ regions }: { regions: { region: string; branches: string[] }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(raiseRegionQueryToBranchAction, INIT);
  const [region, setRegion] = useState(regions[0]?.region ?? "");
  const branches = regions.find((r) => r.region === region)?.branches ?? [];
  const [branch, setBranch] = useState(branches[0] ?? "");

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => setOpen(false), 1600);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  if (!open) return <ComposerButton label="Ask a specific branch" onClick={() => setOpen(true)} />;

  if (state.ok) {
    return (
      <div className="rounded-lg border border-good/30 bg-good-soft px-4 py-3 text-sm text-good">
        Sent to {branch} — it&apos;ll show up in their own Queries page, and they&apos;ll see a reminder next time they log in.
      </div>
    );
  }

  return (
    <ComposerCard label="Ask a specific branch" onClose={() => setOpen(false)}>
      <form action={action} className="space-y-3">
        {regions.length > 1 ? (
          <select
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setBranch(regions.find((r) => r.region === e.target.value)?.branches[0] ?? "");
            }}
            className={inputClass}
          >
            {regions.map((r) => (
              <option key={r.region} value={r.region}>
                {r.region}
              </option>
            ))}
          </select>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <select name="branch" value={branch} onChange={(e) => setBranch(e.target.value)} className={inputClass}>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <input type="date" name="date" className={inputClass} />
        </div>
        <textarea
          name="note"
          required
          rows={3}
          placeholder="What would you like this branch to check or fix?"
          className={inputClass}
        />
        {state.error ? <p className="text-[12px] text-bad">{state.error}</p> : null}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending || !branch}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </ComposerCard>
  );
}

/** HQ raising a question to a chosen region — region (required) + optional date/branch + note. */
export function RaiseToRegionForm({ regions }: { regions: { region: string; branches: string[] }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(raiseRegionQueryToRegionAction, INIT);
  const [region, setRegion] = useState(regions[0]?.region ?? "");
  const branches = regions.find((r) => r.region === region)?.branches ?? [];

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => setOpen(false), 1600);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  if (!open) return <ComposerButton label="Ask a regional manager" onClick={() => setOpen(true)} />;

  if (state.ok) {
    return (
      <div className="rounded-lg border border-good/30 bg-good-soft px-4 py-3 text-sm text-good">
        Sent — the regional manager will see it here.
      </div>
    );
  }

  return (
    <ComposerCard label="Ask a regional manager" onClose={() => setOpen(false)}>
      <form action={action} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select name="region" value={region} onChange={(e) => setRegion(e.target.value)} className={inputClass}>
            {regions.map((r) => (
              <option key={r.region} value={r.region}>
                {r.region}
              </option>
            ))}
          </select>
          <input type="date" name="date" className={inputClass} />
        </div>
        <select name="branch" defaultValue="" className={inputClass}>
          <option value="">No specific branch</option>
          {branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <textarea
          name="note"
          required
          rows={3}
          placeholder="What would you like this regional manager to check or explain?"
          className={inputClass}
        />
        {state.error ? <p className="text-[12px] text-bad">{state.error}</p> : null}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </ComposerCard>
  );
}
