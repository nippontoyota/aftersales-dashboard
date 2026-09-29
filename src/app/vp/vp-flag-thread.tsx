import { recipientLabel } from "@/lib/vp-flags/recipient-label";
import type { VpQueryRecipient, VpQueryThread } from "@/lib/vp-flags/store";
import { ReplyForm, StatusButton } from "./queries-forms";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/** One recipient's own status + reply (or reply box) within a thread. */
function RecipientRow({ recipient, canReply }: { recipient: VpQueryRecipient; canReply: boolean }) {
  return (
    <div className="mt-2 rounded-md border-l-2 border-accent bg-surface-2 px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-fg-subtle">
        <span>{recipientLabel(recipient)}</span>
        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${recipient.status === "answered" ? "border-info/30 bg-info-soft text-info" : "border-warn/30 bg-warn-soft text-warn"}`}>
          {recipient.status === "answered" ? "Replied" : "Waiting"}
        </span>
      </div>
      {recipient.reply ? (
        <>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg">{recipient.reply}</p>
          <div className="mt-1 text-[10.5px] text-fg-faint">
            {recipient.repliedBy}
            {recipient.repliedAt ? ` · ${when(recipient.repliedAt)}` : ""}
          </div>
        </>
      ) : canReply ? (
        <ReplyForm id={recipient.id} />
      ) : (
        <p className="mt-1 text-[12px] italic text-fg-faint">Waiting on a reply.</p>
      )}
    </div>
  );
}

/**
 * One query thread — the VP's question with its pinned context, then every
 * recipient's own status/reply stacked underneath (2026-09-26: a thread can
 * be addressed to several recipients at once, each replying independently).
 * `viewerReplyableRecipientIds` = the recipient row ids this viewer is
 * allowed to answer (their own hq/regional/branch row, if any, on this
 * thread) — every other recipient row on the same thread renders read-only
 * for them. `canManage` = viewer can archive/reopen the whole thread (the
 * VP on their own threads).
 */
export function VpFlagThread({
  thread,
  viewerReplyableRecipientIds,
  canManage,
}: {
  thread: VpQueryThread;
  viewerReplyableRecipientIds: ReadonlySet<number>;
  canManage: boolean;
}) {
  const context = [
    thread.date && `Date ${thread.date}`,
    thread.region && `Region ${thread.region}`,
    thread.branch && `Branch ${thread.branch}`,
    thread.metric && `Metric ${thread.metric}`,
    thread.value && `Value ${thread.value}`,
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
            thread.archived ? "border-border bg-surface-2 text-fg-subtle" : "border-warn/30 bg-warn-soft text-warn"
          }`}
        >
          {thread.archived ? "resolved" : "open"}
        </span>
        <span className="text-[11px] text-fg-faint">
          {thread.createdBy} · {when(thread.createdAt)}
        </span>
      </div>

      {context.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {context.map((c) => (
            <span key={c} className="rounded border border-border-subtle bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-subtle">
              {c}
            </span>
          ))}
        </div>
      ) : null}

      <p className="mt-2 whitespace-pre-wrap text-sm text-fg">{thread.note}</p>

      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-fg-faint">
        <span className="uppercase tracking-wide">To:</span>
        {thread.recipients.map((r) => (
          <span key={r.id}>{recipientLabel(r)}</span>
        ))}
      </div>

      {thread.recipients.map((r) => (
        <RecipientRow key={r.id} recipient={r} canReply={viewerReplyableRecipientIds.has(r.id)} />
      ))}

      {canManage ? (
        <div className="mt-3">
          {thread.archived ? (
            <StatusButton id={thread.id} to="open" label="Reopen" />
          ) : (
            <StatusButton id={thread.id} to="closed" label="Mark resolved" />
          )}
        </div>
      ) : null}
    </div>
  );
}
