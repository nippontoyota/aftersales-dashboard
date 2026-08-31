"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatUploadedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

/**
 * Generic upload widget shared by all report-type uploads (BA Tool,
 * Service Info Report, Part Sale Report, SSRV089, scom205) — same
 * date+file+submit shape, differing only in endpoint and how the success
 * payload reads back.
 */
export function ReportUploadCard({
  endpoint,
  title,
  description,
  fileLabel,
  accept,
  formatSuccess,
  alreadyUploaded,
}: {
  endpoint: string;
  title: string;
  description?: string;
  fileLabel: string;
  accept: string;
  formatSuccess: (data: Record<string, unknown>) => string;
  /** When today's report for this branch is already saved, show a locked
   * status instead of the form — branches can't re-upload it themselves
   * (2026-08-31, at the user's request); a correction goes through HQ's
   * Upload Sheet instead. Omit entirely for uploads this lock doesn't apply
   * to (HQ's own BA Tool upload). */
  alreadyUploaded?: { sourceFileName: string; uploadedAt: string } | null;
}) {
  if (alreadyUploaded) {
    return (
      <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true">
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 className="text-sm font-semibold text-emerald-900">{title} — already uploaded today</h2>
        </div>
        <p className="text-xs text-emerald-800">
          {alreadyUploaded.sourceFileName} · {formatUploadedAt(alreadyUploaded.uploadedAt)}
        </p>
        <p className="text-xs text-emerald-700">Need to fix a mistake? Ask HQ to correct it via Upload Sheet.</p>
      </div>
    );
  }

  return <ReportUploadForm endpoint={endpoint} title={title} description={description} fileLabel={fileLabel} accept={accept} formatSuccess={formatSuccess} />;
}

function ReportUploadForm({
  endpoint,
  title,
  description,
  fileLabel,
  accept,
  formatSuccess,
}: {
  endpoint: string;
  title: string;
  description?: string;
  fileLabel: string;
  accept: string;
  formatSuccess: (data: Record<string, unknown>) => string;
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
    try {
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      setSuccess(formatSuccess(data));
      formRef.current?.reset();
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
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 rounded-md border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>

      <div>
        <label htmlFor={dateId} className="block text-xs font-medium text-slate-600">
          Report date
        </label>
        <input
          id={dateId}
          name="date"
          type="date"
          required
          defaultValue={todayIso()}
          className="mt-1 h-9 w-full rounded border border-slate-300 px-3 text-sm"
        />
      </div>

      <div>
        <label htmlFor={fieldId} className="block text-xs font-medium text-slate-600">
          {fileLabel}
        </label>
        <input id={fieldId} name="file" type="file" accept={accept} required className="mt-1 block w-full text-sm" />
      </div>

      {error ? (
        <p role="alert" aria-live="assertive" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" aria-live="polite" className="text-sm text-emerald-600">
          {success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
