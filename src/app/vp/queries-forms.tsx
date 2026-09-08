"use client";

import { useActionState } from "react";
import { replyVpFlagAction, setVpFlagStatusAction, type FlagState } from "./actions";

const INIT: FlagState = { error: null, ok: false };

/** HQ's reply box on a flag thread. */
export function ReplyForm({ id }: { id: number }) {
  const [state, action, pending] = useActionState(replyVpFlagAction, INIT);
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="id" value={id} />
      <textarea
        name="reply"
        required
        rows={2}
        placeholder="Reply to the VP…"
        className="w-full rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
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

/** VP (or HQ) toggling a thread open/closed. */
export function StatusButton({ id, to, label }: { id: number; to: "open" | "closed"; label: string }) {
  const [state, action, pending] = useActionState(setVpFlagStatusAction, INIT);
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
