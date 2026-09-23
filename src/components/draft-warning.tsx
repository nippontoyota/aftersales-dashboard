export function DraftWarning({ uploadedBranches, totalBranches }: { uploadedBranches: number; totalBranches: number }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft/40 px-4 py-3 shadow-sm print:hidden">
      <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-warn" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p className="text-[13px] leading-relaxed text-fg">
        <span className="font-semibold tracking-wide text-warn">DRAFT (Unpublished):</span>{" "}
        {uploadedBranches >= totalBranches ? (
          "All branches have uploaded their figures, but HQ has not yet published this date for the wider group."
        ) : (
          <>
            Data for this date is actively syncing and incomplete. Only <span className="font-semibold tabular-nums">{uploadedBranches} / {totalBranches}</span> branches have uploaded their figures so far.
          </>
        )}
      </p>
    </div>
  );
}
