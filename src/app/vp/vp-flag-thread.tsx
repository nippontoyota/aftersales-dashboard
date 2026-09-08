import type { VpFlag } from "@/lib/vp-flags/store";
import { ReplyForm, StatusButton } from "./queries-forms";

const STATUS_BADGE: Record<VpFlag["status"], string> = {
  open: "border-warn/30 bg-warn-soft text-warn",
  answered: "border-info/30 bg-info-soft text-info",
  closed: "border-border bg-surface-2 text-fg-subtle",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * One query thread — the VP's question with its pinned context, then HQ's
 * reply (or a reply box, for HQ). `canReply` = viewer is HQ; `canManage` =
 * viewer can open/close (VP on their own, or HQ).
 */
export function VpFlagThread({
  flag,
  canReply,
  canManage,
}: {
  flag: VpFlag;
  canReply: boolean;
  canManage: boolean;
}) {
  const context = [
    flag.date && `Date ${flag.date}`,
    flag.region && `Region ${flag.region}`,
    flag.branch && `Branch ${flag.branch}`,
    flag.metric && `Metric ${flag.metric}`,
    flag.value && `Value ${flag.value}`,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_BADGE[flag.status]}`}>
          {flag.status}
        </span>
        <span className="text-[11px] text-fg-faint">
          {flag.createdBy} · {when(flag.createdAt)}
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

      <p className="mt-2 whitespace-pre-wrap text-sm text-fg">{flag.note}</p>

      {flag.hqReply ? (
        <div className="mt-3 rounded-md border-l-2 border-accent bg-surface-2 px-3 py-2">
          <div className="text-[11px] font-medium text-fg-subtle">
            HQ · {flag.repliedBy}
            {flag.repliedAt ? ` · ${when(flag.repliedAt)}` : ""}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg">{flag.hqReply}</p>
        </div>
      ) : canReply ? (
        <ReplyForm id={flag.id} />
      ) : (
        <p className="mt-3 text-[12px] italic text-fg-faint">Waiting on HQ.</p>
      )}

      {canManage ? (
        <div className="mt-3">
          {flag.status === "closed" ? (
            <StatusButton id={flag.id} to="open" label="Reopen" />
          ) : (
            <StatusButton id={flag.id} to="closed" label="Mark resolved" />
          )}
        </div>
      ) : null}
    </div>
  );
}
