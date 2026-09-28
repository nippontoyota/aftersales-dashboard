import type { AdminAccount } from "@/lib/admin-store";
import { listAllVpQueryThreads, listVpQueryThreadsForRegion } from "@/lib/vp-flags/store";
import { VpFlagThread } from "@/app/vp/vp-flag-thread";

/**
 * VP query threads, surfaced on /queries. HQ sees every open thread
 * (full oversight) and can reply to whichever recipient rows are addressed
 * to HQ; a regional manager sees threads with a recipient row addressed to
 * their own region and can reply to that row. Everyone else gets nothing —
 * a branch admin's own slice lives on their own /queries page instead (see
 * app/queries/page.tsx's BranchQueriesContent).
 */
export async function VpFlagsPanel({ admin }: { admin: AdminAccount }) {
  if (admin.role !== "hq" && admin.role !== "hq_viewer" && admin.role !== "regional") return null;

  const threads =
    admin.role === "regional" ? await listVpQueryThreadsForRegion(admin.region) : await listAllVpQueryThreads();
  const open = threads.filter((t) => !t.archived);
  if (open.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-info/30 bg-info-soft/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-info">
          VP Service — {open.length} open quer{open.length === 1 ? "y" : "ies"}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {open.map((t) => {
          const replyable = new Set(
            t.recipients
              .filter((r) =>
                admin.role === "regional" ? r.type === "regional" && r.region === admin.region : r.type === "hq" && admin.role === "hq"
              )
              .map((r) => r.id)
          );
          return <VpFlagThread key={t.id} thread={t} viewerReplyableRecipientIds={replyable} canManage={false} />;
        })}
      </div>
    </div>
  );
}
