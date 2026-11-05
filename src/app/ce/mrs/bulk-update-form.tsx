"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type BulkRow = {
  rowNumber: number;
  vin: string;
  customerName: string | null;
  currentStatus: string | null;
  outcomeRaw: string;
  outcome: string | null;
  newStatus: string | null;
  nextFollowUpDate: string | null;
  note: string;
  error: string | null;
  warning: string | null;
  empty: boolean;
};

type ApplyResult = { rowNumber: number; vin: string; success: boolean; message: string };

function describeFetchError(err: unknown): string {
  if (err instanceof SyntaxError) return "The server's response couldn't be read — try refreshing the page and signing in again.";
  if (err instanceof TypeError) return `Could not reach the server (${err.message}). Check your internet connection and try again.`;
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return "Unknown error.";
}

/** The "download, call offline, reupload" workflow's upload half
 * (2026-11-05, at the user's request) — Preview parses and validates the
 * reuploaded sheet without writing anything, so the CAC team can catch a
 * mistake (or an accidental re-upload of a sheet already applied, via the
 * "possible duplicate" warning) before Confirm actually commits it. */
export function MrsBulkUpdateForm() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [results, setResults] = useState<ApplyResult[] | null>(null);

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  function reset() {
    setFile(null);
    setError(null);
    setRows(null);
    setResults(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function close() {
    dialog.current?.close();
    setOpen(false);
    reset();
  }

  async function preview() {
    if (!file) return;
    setPending(true);
    setError(null);
    setRows(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/ce/mrs-bulk-update/preview", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not preview this file.");
        return;
      }
      setRows(data.rows as BulkRow[]);
    } catch (err) {
      setError(describeFetchError(err));
    } finally {
      setPending(false);
    }
  }

  async function apply() {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/ce/mrs-bulk-update/apply", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not apply this file.");
        return;
      }
      setResults(data.results as ApplyResult[]);
      router.refresh();
    } catch (err) {
      setError(describeFetchError(err));
    } finally {
      setPending(false);
    }
  }

  const readyRows = rows?.filter((r) => !r.error && !r.empty) ?? [];
  const errorRows = rows?.filter((r) => r.error) ?? [];
  const warningRows = rows?.filter((r) => r.warning && !r.error) ?? [];
  const emptyRows = rows?.filter((r) => r.empty) ?? [];

  const successResults = results?.filter((r) => r.success) ?? [];
  const failedResults = results?.filter((r) => !r.success) ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong px-3 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Upload completed sheet
      </button>
      {open ? (
        <dialog
          ref={dialog}
          aria-labelledby="mrs-bulk-upload-title"
          onClose={() => { setOpen(false); reset(); }}
          onClick={(event) => { if (event.target === event.currentTarget) close(); }}
          className="fixed inset-0 m-auto max-h-[90dvh] w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-fg shadow-pop backdrop:bg-black/70"
        >
          <div className="flex max-h-[90dvh] flex-col">
            <header className="relative shrink-0 border-b border-border px-5 py-4 pl-16">
              <button type="button" onClick={close} aria-label="Close" className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-xl leading-none text-fg-muted hover:bg-surface-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">×</button>
              <h2 id="mrs-bulk-upload-title" className="text-base font-semibold text-fg">Upload completed call sheet</h2>
              <p className="mt-0.5 text-xs text-fg-subtle">Fill in Outcome / Follow-up Date / Note on the downloaded Excel while calling, then upload it here. Nothing is saved until you confirm.</p>
            </header>

            <div className="overflow-y-auto px-5 py-4">
              {!results ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInput}
                      type="file"
                      accept=".xlsx"
                      onChange={(event) => { setFile(event.currentTarget.files?.[0] ?? null); setRows(null); setError(null); }}
                      className="block flex-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={preview}
                      disabled={!file || pending}
                      className="h-9 rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
                    >
                      {pending ? "Checking…" : "Preview"}
                    </button>
                  </div>

                  {error ? <p role="alert" className="mt-3 text-sm text-bad">{error}</p> : null}

                  {rows ? (
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-wrap gap-3 text-xs">
                        <span className="rounded-full bg-good-soft px-2.5 py-1 font-medium text-good">{readyRows.length} ready to apply</span>
                        {errorRows.length > 0 ? <span className="rounded-full bg-bad-soft px-2.5 py-1 font-medium text-bad">{errorRows.length} with errors — won&apos;t be applied</span> : null}
                        {warningRows.length > 0 ? <span className="rounded-full bg-warn-soft px-2.5 py-1 font-medium text-warn">{warningRows.length} possible duplicate{warningRows.length === 1 ? "" : "s"}</span> : null}
                        {emptyRows.length > 0 ? <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium text-fg-faint">{emptyRows.length} left blank</span> : null}
                      </div>

                      <div className="max-h-80 overflow-auto rounded-md border border-border">
                        <table className="w-full min-w-[720px] text-left text-xs">
                          <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-fg-faint"><tr>
                            {["Row", "VIN", "Customer", "Current → New", "Note", "Status"].map((label) => <th key={label} className="px-2 py-2 font-semibold">{label}</th>)}
                          </tr></thead>
                          <tbody className="divide-y divide-border-subtle">
                            {rows.filter((r) => !r.empty).map((row) => (
                              <tr key={row.rowNumber} className={row.error ? "bg-bad-soft/40" : row.warning ? "bg-warn-soft/40" : ""}>
                                <td className="px-2 py-2 tabular-nums text-fg-faint">{row.rowNumber}</td>
                                <td className="px-2 py-2 font-mono text-[11px] text-fg-muted">{row.vin || "—"}</td>
                                <td className="px-2 py-2 text-fg-muted">{row.customerName ?? "—"}</td>
                                <td className="whitespace-nowrap px-2 py-2 text-fg-muted">{row.currentStatus ?? "—"}{row.newStatus ? ` → ${row.newStatus}` : ""}</td>
                                <td className="max-w-[220px] truncate px-2 py-2 text-fg-muted" title={row.note}>{row.note || "—"}</td>
                                <td className="px-2 py-2">
                                  {row.error ? <span className="text-bad">{row.error}</span> : row.warning ? <span className="text-warn">{row.warning}</span> : <span className="text-good">Ready</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={apply}
                          disabled={pending || readyRows.length === 0}
                          className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
                        >
                          {pending ? "Applying…" : `Confirm & apply ${readyRows.length} row${readyRows.length === 1 ? "" : "s"}`}
                        </button>
                        <button type="button" onClick={reset} className="h-9 rounded-md border border-border-strong px-4 text-sm font-medium text-fg-muted hover:bg-surface-2">
                          Choose a different file
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="space-y-4">
                  {successResults.length > 0 ? (
                    <div className="rounded-md border border-good/30 bg-good-soft p-4">
                      <p className="text-sm font-medium text-good">{successResults.length} lead{successResults.length === 1 ? "" : "s"} updated</p>
                    </div>
                  ) : null}
                  {failedResults.length > 0 ? (
                    <div className="rounded-md border border-bad/30 bg-bad-soft p-4">
                      <p className="text-sm font-medium text-bad">{failedResults.length} row{failedResults.length === 1 ? "" : "s"} failed to apply</p>
                      <ul className="mt-2 space-y-1">
                        {failedResults.map((r) => <li key={r.rowNumber} className="text-xs text-bad">Row {r.rowNumber} ({r.vin}): {r.message}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  <button type="button" onClick={close} className="h-9 rounded-md border border-border-strong px-4 text-sm font-medium text-fg-muted hover:bg-surface-2">Done</button>
                </div>
              )}
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
