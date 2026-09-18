"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Same visual shape as components/report-upload-card.tsx, but a month
 * picker instead of a day picker — incentive slab targets are month-scoped,
 * not per-day (see db/schema.sql's incentive_slab_targets comment). Kept as
 * its own small component rather than adapting the shared card: that card's
 * date field, duplicate-upload flow, and once-per-day lock are all built
 * around a single day, none of which apply here — a re-upload for the same
 * month is always allowed and fully replaces that month's targets. */
export function IncentiveSlabsUploadForm({ defaultMonth }: { defaultMonth: string }) {
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
    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/upload/incentive-slabs", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      setSuccess(`Saved ${data.branchCount} branch(es) for ${data.month}.`);
      formRef.current?.reset();
      router.refresh();
    } catch {
      setError("Upload failed — could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-card">
      <div>
        <h2 className="text-sm font-semibold text-fg">Incentive Slab Targets</h2>
        <p className="mt-0.5 text-xs text-fg-subtle">
          Upload the slab-wise target workbook for a month — replaces every branch's Slab 1–4 targets for that month.
        </p>
      </div>

      <div>
        <label htmlFor="incentive-slab-month" className="block text-xs font-medium text-fg-muted">
          Month
        </label>
        <input
          id="incentive-slab-month"
          name="month"
          type="month"
          required
          defaultValue={defaultMonth}
          className="mt-1 h-9 w-full rounded-md border border-border-strong px-3 text-sm"
        />
      </div>

      <div>
        <label htmlFor="incentive-slab-file" className="block text-xs font-medium text-fg-muted">
          Slab target file (.xlsx)
        </label>
        <input
          id="incentive-slab-file"
          name="file"
          type="file"
          accept=".xlsx,.xls"
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
