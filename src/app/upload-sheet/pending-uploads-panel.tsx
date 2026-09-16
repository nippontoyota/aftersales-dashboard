import type { PendingUploadsSummary } from "@/lib/pending-uploads";
import { REPORT_TYPE_LABELS } from "@/lib/pending-uploads";

/** What HQ checks each morning (by ~11am, at the user's request) to see
 * which branches still need chasing — cross-references every branch against
 * its required daily report types for the day (6 normally; 4 for the Body &
 * Paint-only branches, which get no GS-variant files — see
 * pending-uploads.ts). Sits above the Upload Sheet form itself: seeing
 * what's missing and fixing it (on a branch's behalf, right below) are the
 * same workflow. */
export function PendingUploadsPanel({ summary }: { summary: PendingUploadsSummary }) {
  const allDone = summary.pending.length === 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">Pending Uploads</h2>
        <span className="text-xs font-medium tabular-nums text-fg-subtle">
          {summary.completeCount} of {summary.totalBranches} branches complete
        </span>
      </div>
      <p className="mt-0.5 text-xs text-fg-subtle">For {summary.date} — the report date every branch is currently uploading against.</p>

      {allDone ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-good/30 bg-good-soft p-3 text-sm text-good">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0" aria-hidden="true">
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Every branch has uploaded all its required reports for {summary.date}.
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {summary.pending.map((b) => (
            <li key={b.branch} className="rounded-lg border border-warn/30 bg-warn-soft p-2.5">
              <div className="text-sm font-semibold text-fg">{b.branch}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {b.missing.map((type) => (
                  <span key={type} className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">
                    {REPORT_TYPE_LABELS[type]}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {summary.onlineStores.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-fg-faint">Online stores — informational, not required</div>
          {summary.onlineStores.map((o) => (
            <div key={o.code} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg-subtle p-2 text-xs">
              <span className="font-medium text-fg">
                {o.code} <span className="font-normal text-fg-faint">({o.parentBranch}&apos;s online store)</span>
              </span>
              <span className={o.uploaded ? "font-medium text-good" : "text-fg-subtle"}>
                {o.uploaded ? "Part Sale Report uploaded" : "No Part Sale Report today"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
