import type { RegionQuery } from "@/lib/region-queries/store";
import { ReplyForm, StatusButton } from "./region-query-forms";

const STATUS_BADGE: Record<RegionQuery["status"], string> = {
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
 * One HQ ↔ Regional Manager thread — the asker's question with its pinned
 * context, then the reply (or a reply box, for whoever the question is
 * addressed to). Same shape as VpFlagThread, generalized for either
 * direction: `viewerCanReply` = it's this viewer's turn to answer;
 * `viewerCanManage` = they can open/close (the original asker, or HQ).
 */
export function RegionQueryThread({
  query,
  viewerCanReply,
  viewerCanManage,
}: {
  query: RegionQuery;
  viewerCanReply: boolean;
  viewerCanManage: boolean;
}) {
  const askerLabel =
    query.direction === "to_hq" ? `${query.region} regional manager` : query.direction === "to_region" ? "HQ" : "HQ or your regional manager";
  const replierLabel =
    query.direction === "to_hq" ? "HQ" : query.direction === "to_region" ? `${query.region} regional manager` : query.contextBranch ?? "the branch";

  const context = [
    query.contextDate && `Date ${query.contextDate}`,
    query.direction !== "to_branch" && query.contextBranch && `Branch ${query.contextBranch}`,
    query.direction === "to_region" && `To ${query.region}`,
    query.direction === "to_branch" && `To ${query.contextBranch}`,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_BADGE[query.status]}`}>
          {query.status}
        </span>
        <span className="text-[11px] text-fg-faint">
          {askerLabel} · {when(query.createdAt)}
        </span>
      </div>

      {context.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {context.map((c) => (
            <span key={c as string} className="rounded border border-border-subtle bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-subtle">
              {c}
            </span>
          ))}
        </div>
      ) : null}

      <p className="mt-2 whitespace-pre-wrap text-sm text-fg">{query.note}</p>

      {query.reply ? (
        <div className="mt-3 rounded-md border-l-2 border-accent bg-surface-2 px-3 py-2">
          <div className="text-[11px] font-medium text-fg-subtle">
            {replierLabel} · {query.repliedBy}
            {query.repliedAt ? ` · ${when(query.repliedAt)}` : ""}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg">{query.reply}</p>
        </div>
      ) : viewerCanReply ? (
        <ReplyForm id={query.id} />
      ) : (
        <p className="mt-3 text-[12px] italic text-fg-faint">Waiting on {replierLabel}.</p>
      )}

      {viewerCanManage ? (
        <div className="mt-3">
          {query.status === "closed" ? (
            <StatusButton id={query.id} to="open" label="Reopen" />
          ) : (
            <StatusButton id={query.id} to="closed" label="Mark resolved" />
          )}
        </div>
      ) : null}
    </div>
  );
}
