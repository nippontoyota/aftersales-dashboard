"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { yesterdayIso } from "@/lib/utils";

function formatUploadedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

type UploadedInfo = { sourceFileName: string; uploadedAt: string };

/**
 * Generic upload widget shared by all report-type uploads (BA Tool,
 * Service Info Report, Part Sale Report, SSRV089, scom205) — same
 * date+file+submit shape, differing only in endpoint and how the success
 * payload reads back.
 *
 * `reportDate`: the branch Daily Reports panel drives every section from a
 * single date picker at the top and passes the chosen date in here, so no
 * per-form date field is shown. HQ's own BA Tool upload omits it and gets a
 * self-contained date field defaulting to yesterday instead.
 */
export function ReportUploadCard({
  endpoint,
  title,
  description,
  fileLabel,
  accept,
  reportDate,
  formatSuccess,
  alreadyUploaded,
}: {
  endpoint: string;
  title: string;
  description?: string;
  fileLabel: string;
  accept: string;
  reportDate?: string;
  formatSuccess: (data: Record<string, unknown>) => string;
  /** When this report for the picked date is already saved for this branch,
   * show a locked status instead of the form — branches can't re-upload it
   * themselves (2026-08-31, at the user's request); a correction goes
   * through HQ's Upload Sheet instead. Omit entirely for uploads this lock
   * doesn't apply to (HQ's own BA Tool upload). */
  alreadyUploaded?: UploadedInfo | null;
}) {
  // Whether this card participates in the once-per-day lock at all. `null`
  // (branch, not yet uploaded) still participates; only `undefined` (HQ BA
  // Tool) opts out and keeps a re-usable form.
  const participatesInLock = alreadyUploaded !== undefined;

  // A just-completed upload, held client-side so the confirmation survives
  // the router.refresh() below — without this the server re-render swaps in
  // its own locked panel and the "it worked" message the branch admin needs
  // to see never gets painted (they'd see the page jump with no feedback).
  const [justUploaded, setJustUploaded] = useState<UploadedInfo | null>(null);
  const [justUploadedMessage, setJustUploadedMessage] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleUploaded = useCallback((info: UploadedInfo, message: string) => {
    setJustUploaded(info);
    setJustUploadedMessage(message);
  }, []);

  // Land the branch admin on the confirmation once it renders — the sections
  // stack tall and router.refresh() (plus the form collapsing to this
  // shorter panel) used to leave them scrolled somewhere unrelated, with no
  // visible sign the upload worked. Re-run shortly after too, to win against
  // the refresh's own scroll settling.
  useEffect(() => {
    if (!justUploaded) return;
    const scroll = () => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    scroll();
    const t = setTimeout(scroll, 250);
    return () => clearTimeout(t);
  }, [justUploaded]);

  const locked = alreadyUploaded ?? justUploaded;

  return (
    <div ref={cardRef}>
      {locked ? (
        <div className="space-y-2 rounded-md border border-good/30 bg-good-soft p-5">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0 text-good" aria-hidden="true">
              <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2 className="text-sm font-semibold text-good">
              {title} — {justUploaded && !alreadyUploaded ? "uploaded" : "already uploaded"}
              {reportDate ? ` for ${reportDate}` : ""}
            </h2>
          </div>
          {justUploadedMessage && !alreadyUploaded ? <p className="text-xs text-good">{justUploadedMessage}</p> : null}
          <p className="text-xs text-good">
            {locked.sourceFileName} · {formatUploadedAt(locked.uploadedAt)}
          </p>
          <p className="text-xs text-good">Need to fix a mistake? Ask HQ to correct it via Upload Sheet.</p>
        </div>
      ) : (
        <ReportUploadForm
          endpoint={endpoint}
          title={title}
          description={description}
          fileLabel={fileLabel}
          accept={accept}
          reportDate={reportDate}
          formatSuccess={formatSuccess}
          onUploaded={participatesInLock ? handleUploaded : undefined}
        />
      )}
    </div>
  );
}

function ReportUploadForm({
  endpoint,
  title,
  description,
  fileLabel,
  accept,
  reportDate,
  formatSuccess,
  onUploaded,
}: {
  endpoint: string;
  title: string;
  description?: string;
  fileLabel: string;
  accept: string;
  reportDate?: string;
  formatSuccess: (data: Record<string, unknown>) => string;
  /** Called after a successful upload for cards that lock afterwards, so the
   * parent can show a persistent confirmation. Omitted for HQ's re-usable
   * BA Tool form, which just shows the inline success line and stays open. */
  onUploaded?: (info: UploadedInfo, message: string) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    const file = formData.get("file");
    const fileName = file instanceof File ? file.name : "uploaded file";
    // Branch panel: the date comes from the shared picker above. BA Tool:
    // the in-form field below already put it in the FormData.
    if (reportDate) formData.set("date", reportDate);
    try {
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      const message = formatSuccess(data);
      setSuccess(message);
      formRef.current?.reset();
      if (onUploaded) {
        onUploaded({ sourceFileName: fileName, uploadedAt: new Date().toISOString() }, message);
      }
      router.refresh();
    } catch {
      setError("Upload failed — could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  const fieldId = `file-${endpoint.replace(/\W+/g, "-")}`;
  const dateId = `date-${endpoint.replace(/\W+/g, "-")}`;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-card">
      <div>
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-fg-subtle">{description}</p> : null}
      </div>

      {reportDate ? null : (
        <div>
          <label htmlFor={dateId} className="block text-xs font-medium text-fg-muted">
            Report date
          </label>
          <input
            id={dateId}
            name="date"
            type="date"
            required
            defaultValue={yesterdayIso()}
            className="mt-1 h-9 w-full rounded-md border border-border-strong px-3 text-sm"
          />
        </div>
      )}

      <div>
        <label htmlFor={fieldId} className="block text-xs font-medium text-fg-muted">
          {fileLabel}
        </label>
        <input
          id={fieldId}
          name="file"
          type="file"
          accept={accept}
          required
          className="mt-1 block w-full text-sm text-fg-subtle file:mr-3 file:cursor-pointer file:rounded file:border file:border-border-strong file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg hover:file:bg-surface-3"
        />
      </div>

      {error ? (
        <p role="alert" aria-live="assertive" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" aria-live="polite" className="text-sm text-good">
          {success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
