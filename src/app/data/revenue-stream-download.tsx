"use client";

import { useState } from "react";

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function RevenueStreamDownload({ defaultDate }: { defaultDate: string }) {
  const [date, setDate] = useState(defaultDate);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetched rather than a plain link: a picked date can have no report, and the
  // route's JSON error would otherwise replace this whole page.
  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hq/revenue-stream-export?date=${date}`);
      // An expired session redirects to the login page with a 200 — without this
      // check its HTML would be saved as the .xlsx.
      if (response.redirected) {
        setError("Your session has expired — sign in again.");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Download failed.");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `revenue-stream-${date}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4 shadow-card">
      <label className="flex flex-col items-start gap-1">
        <span className="text-xs font-medium text-fg-muted">Report date</span>
        <input
          type="date"
          value={date}
          max={defaultDate}
          required
          onChange={(e) => {
            setDate(e.target.value);
            setError(null);
          }}
          className="h-8 rounded-md border border-border-strong px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>
      {date ? (
        <div className="mt-3 text-sm text-fg-muted">
          Downloading for <span className="font-semibold text-fg">{longDate(date)}</span>.
        </div>
      ) : null}
      <button
        type="button"
        onClick={download}
        disabled={!date || downloading}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M8 2v8m0 0-3-3m3 3 3-3M3 13h10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {downloading ? "Preparing…" : date ? `Download Excel (${date})` : "Download Excel"}
      </button>
      {error ? <div className="mt-2 text-xs text-bad">{error}</div> : null}
    </div>
  );
}
