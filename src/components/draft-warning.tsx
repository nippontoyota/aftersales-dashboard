export function DraftWarning({
  uploadedBranches,
  totalBranches,
  /** Branch codes that haven't uploaded yet — VP view only (2026-10-01).
   * Every other caller omits this and keeps the plain X/Y count. */
  missingBranches,
  /** Set when the viewed date is flagged in report_holidays (/data's Report
   * Holidays panel) — swaps the "still syncing" copy for an explanation,
   * since no further branches are expected to file for a holiday
   * (2026-10-22). */
  holiday,
}: {
  uploadedBranches: number;
  totalBranches: number;
  missingBranches?: string[];
  holiday?: { note: string | null } | null;
}) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft/40 px-4 py-3 shadow-sm print:hidden">
      <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-warn" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div className="text-[13px] leading-relaxed text-fg">
        <p>
          {holiday ? (
            <>
              <span className="font-semibold tracking-wide text-warn">HOLIDAY:</span>{" "}
              {holiday.note ? (
                <>This date was a company holiday ({holiday.note}) — no branches were expected to work or file a report.</>
              ) : (
                <>This date was flagged as a company holiday — no branches were expected to work or file a report.</>
              )}
            </>
          ) : (
            <>
              <span className="font-semibold tracking-wide text-warn">DRAFT (Unpublished):</span>{" "}
              {uploadedBranches >= totalBranches ? (
                "All branches have uploaded their figures, but HQ has not yet published this date for the wider group."
              ) : (
                <>
                  Data for this date is actively syncing and incomplete. Only <span className="font-semibold tabular-nums">{uploadedBranches} / {totalBranches}</span> branches have uploaded their figures so far.
                </>
              )}
            </>
          )}
        </p>
        {!holiday && missingBranches && missingBranches.length > 0 ? (
          <p className="mt-1 text-fg-subtle">
            <span className="font-medium">Not yet uploaded:</span> {missingBranches.join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
