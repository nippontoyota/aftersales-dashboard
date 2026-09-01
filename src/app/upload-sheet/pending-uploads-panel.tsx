import type { PendingUploadsSummary } from "@/lib/pending-uploads";
import { REPORT_TYPE_LABELS } from "@/lib/pending-uploads";

/** What HQ checks each morning (by ~11am, at the user's request) to see
 * which branches still need chasing — cross-references all 20 branches
 * against all 6 required daily report types for the day. Sits above the
 * Upload Sheet form itself: seeing what's missing and fixing it (on a
 * branch's behalf, right below) are the same workflow. */
export function PendingUploadsPanel({ summary }: { summary: PendingUploadsSummary }) {
  const allDone = summary.pending.length === 0;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Pending Uploads</h2>
        <span className="text-xs font-medium tabular-nums text-slate-500">
          {summary.completeCount} of {summary.totalBranches} branches complete
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">For {summary.date} — the report date every branch is currently uploading against.</p>

      {allDone ? (
        <div className="mt-3 flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0" aria-hidden="true">
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Every branch has uploaded all 6 reports for {summary.date}.
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {summary.pending.map((b) => (
            <li key={b.branch} className="rounded border border-amber-200 bg-amber-50 p-2.5">
              <div className="text-sm font-semibold text-slate-900">{b.branch}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {b.missing.map((type) => (
                  <span key={type} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    {REPORT_TYPE_LABELS[type]}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
