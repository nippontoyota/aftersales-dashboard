"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CeImportInfo } from "@/lib/ce/store";

type Result = {
  importedRows: number;
  archivedRows: number;
  fileName: string;
  minReportDate: string;
  maxReportDate: string;
};

export function UioUploadForm({ latest }: { latest: CeImportInfo | null }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm("Replace the active CE lead dataset with this workbook? Existing workflow history will be preserved by VIN.")) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/upload/uio", { method: "POST", body: new FormData(event.currentTarget) });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      setResult(data);
      formRef.current?.reset();
      router.refresh();
    } catch {
      setError("Upload failed — could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="rounded-lg border border-border bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">CE annual UIO workbook</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-fg-subtle">
            Replaces the active CE dataset. Leads missing from the new file are archived; matching VINs keep their status, follow-up, and activity history.
          </p>
        </div>
        <a href="/ce" className="text-xs font-medium text-accent-text hover:underline">Open CE Leads</a>
      </div>

      {latest ? (
        <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-xs text-fg-muted">
          Current: <span className="font-medium text-fg">{latest.sourceFileName}</span> · {latest.rowCount.toLocaleString("en-IN")} rows · through {latest.maxReportDate} · uploaded {new Date(latest.uploadedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-fg-muted">UIO workbook (.xlsx, up to 15 MB)</span>
          <input
            name="file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="mt-1 block w-full text-sm text-fg-subtle file:mr-3 file:cursor-pointer file:rounded file:border file:border-border-strong file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg hover:file:bg-surface-3"
          />
        </label>
        <button type="submit" disabled={pending} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60">
          {pending ? "Importing…" : "Replace CE dataset"}
        </button>
      </div>

      {error ? <p role="alert" className="mt-3 text-sm text-bad">{error}</p> : null}
      {result ? (
        <p role="status" className="mt-3 text-sm text-good">
          Imported {result.importedRows.toLocaleString("en-IN")} rows from {result.fileName}; archived {result.archivedRows.toLocaleString("en-IN")} missing leads. Report dates: {result.minReportDate}–{result.maxReportDate}.
        </p>
      ) : null}
    </form>
  );
}
