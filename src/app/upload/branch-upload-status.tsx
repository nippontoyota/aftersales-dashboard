import { REPORT_TYPE_LABELS, type ReportTypeKey } from "@/lib/pending-uploads";

type UploadedInfo = { sourceFileName: string; uploadedAt: string } | null;

function formatUploadedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

/** Read-only view of the day's 7 required report types (5 for a Body &
 * Paint-only branch) for a branch's own reporting date — replaces the manual
 * upload forms branches used to fill in themselves (now CTDMS-automation-only,
 * see d88ca68) while still letting them confirm the automation actually ran. */
export function BranchUploadStatus({
  reportDate,
  statuses,
  onlineStore,
}: {
  reportDate: string;
  statuses: { key: ReportTypeKey; info: UploadedInfo }[];
  onlineStore?: { code: string; info: UploadedInfo };
}) {
  const allDone = statuses.every((s) => s.info != null);

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-fg">Upload status</h1>
      <p className="mt-1 text-sm text-fg-subtle">
        These reports now come in automatically — this just shows what&apos;s arrived for{" "}
        <span className="font-medium text-fg-muted">{reportDate}</span>. Missing something? Contact HQ.
      </p>

      {allDone ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-good/30 bg-good-soft p-3 text-sm text-good">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0" aria-hidden="true">
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All required reports are in for {reportDate}.
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {statuses.map(({ key, info }) => (
          <li
            key={key}
            className={
              info
                ? "rounded-md border border-good/30 bg-good-soft p-3"
                : "rounded-md border border-warn/30 bg-warn-soft p-3"
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span className={info ? "text-sm font-medium text-good" : "text-sm font-medium text-warn"}>{REPORT_TYPE_LABELS[key]}</span>
              <span className={info ? "text-xs font-medium text-good" : "text-xs font-medium text-warn"}>
                {info ? "Received" : "Not yet received"}
              </span>
            </div>
            {info ? (
              <p className="mt-1 text-xs text-good">
                {info.sourceFileName} · {formatUploadedAt(info.uploadedAt)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {onlineStore ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-bg-subtle p-2.5 text-xs">
          <span className="font-medium text-fg">
            {onlineStore.code} <span className="font-normal text-fg-faint">(online store)</span>
          </span>
          <span className={onlineStore.info ? "font-medium text-good" : "text-fg-subtle"}>
            {onlineStore.info ? "Part Sale Report received" : "No Part Sale Report today"}
          </span>
        </div>
      ) : null}
    </>
  );
}
