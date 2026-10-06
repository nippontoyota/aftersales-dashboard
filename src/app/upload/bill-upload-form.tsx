"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PartialData = { invoiceNumber: string | null; taxableValue: number | null; invoiceDate: string | null };

type FileResult = {
  fileName: string;
  success?: boolean;
  invoiceNumber?: string;
  taxableValue?: number;
  invoiceDate?: string;
  error?: string;
  needsManualEntry?: boolean;
  partialData?: PartialData;
};

// Vercel's serverless functions hard-cap a request body at ~4.5MB, enforced at
// the network edge before our route handler (or its own logging) ever runs —
// a rejected request just looks like a dead connection to the browser, shown
// as "could not reach the server" below. Scanned scrap/used-oil PDFs run
// 0.5-3MB each and this form deliberately invites multi-file batches ("handy
// when backfilling a whole month"), so a few of them together routinely blow
// past that ceiling. Splitting into same-request-sized chunks client-side —
// well under the real cap, to leave room for multipart overhead — keeps every
// batch under the limit without needing a different upload path.
const MAX_BATCH_BYTES = 3.5 * 1024 * 1024;

// "Could not reach the server" used to be shown for every failure mode,
// which hid the difference between a genuine dropped connection (TypeError —
// the request never got a response at all) and a response that came back but
// wasn't the JSON we expected (SyntaxError from res.json() — e.g. a session
// timeout bouncing the POST through a redirect to /login, which responds
// with an empty, non-JSON body). Surfacing which one it was, plus the
// browser's own error text, turns a dead-end complaint into something we can
// actually diagnose next time it happens instead of guessing blind.
function describeFetchError(err: unknown): string {
  if (err instanceof SyntaxError) {
    return `Upload failed — the server's response couldn't be read (${err.message}). This usually means the session expired mid-upload — try refreshing the page and signing in again.`;
  }
  if (err instanceof TypeError) {
    return `Upload failed — could not reach the server (${err.message}). Check your internet connection and try again.`;
  }
  if (err instanceof Error) {
    return `Upload failed — ${err.name}: ${err.message}`;
  }
  return "Upload failed — unknown error.";
}

function batchFilesBySize(files: File[], maxBytes: number): File[][] {
  const batches: File[][] = [];
  let current: File[] = [];
  let currentSize = 0;
  for (const file of files) {
    if (current.length > 0 && currentSize + file.size > maxBytes) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }
    // A single file already over maxBytes still gets its own (oversized)
    // batch — nothing more we can do client-side, but it no longer drags
    // the rest of the selection down with it.
    current.push(file);
    currentSize += file.size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function BillUploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<FileResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<"" | "scrap" | "used_oil">("");

  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualInvoice, setManualInvoice] = useState("");
  const [manualTaxable, setManualTaxable] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualPartial, setManualPartial] = useState<PartialData | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setResults([]);
    setManualFile(null);
    setManualPartial(null);
    setProgress(null);

    const formData = new FormData(e.currentTarget);
    const categoryValue = String(formData.get("category") ?? "");
    const manualInvoiceDateValue = String(formData.get("manualInvoiceDate") ?? "");
    const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    const batches = batchFilesBySize(files, MAX_BATCH_BYTES);

    const allResults: FileResult[] = [];
    try {
      for (let i = 0; i < batches.length; i++) {
        if (batches.length > 1) setProgress({ done: i, total: batches.length });

        const batchFormData = new FormData();
        batchFormData.set("category", categoryValue);
        if (manualInvoiceDateValue) batchFormData.set("manualInvoiceDate", manualInvoiceDateValue);
        for (const file of batches[i]) batchFormData.append("file", file);

        const res = await fetch("/api/upload/bill", { method: "POST", body: batchFormData });
        const data = await res.json();

        if (!res.ok && data.error) {
          setError(data.error);
          setResults(allResults);
          return;
        }

        allResults.push(...((data.results as FileResult[]) ?? []));
      }

      setResults(allResults);

      const needsManual = allResults.find((r) => r.needsManualEntry);
      if (needsManual) {
        const matchingFile = files.find((f) => f.name === needsManual.fileName);
        if (matchingFile) {
          setManualFile(matchingFile);
          setManualPartial(needsManual.partialData ?? null);
          setManualInvoice(needsManual.partialData?.invoiceNumber ?? "");
          setManualTaxable(needsManual.partialData?.taxableValue?.toString() ?? "");
          setManualDate(needsManual.partialData?.invoiceDate ?? "");
        }
      }

      if (allResults.length > 0 && allResults.every((r) => r.success)) {
        formRef.current?.reset();
        router.refresh();
      }
    } catch (err) {
      console.error("[bill-upload] batch upload failed:", err);
      setError(describeFetchError(err));
      setResults(allResults);
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  async function handleManualSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!manualFile) return;
    setPending(true);
    setError(null);

    const formData = new FormData();
    formData.set("file", manualFile);
    formData.set("category", category);
    formData.set("manualInvoiceNumber", manualInvoice);
    formData.set("manualTaxableValue", manualTaxable);
    formData.set("manualInvoiceDate", manualDate);

    try {
      const res = await fetch("/api/upload/bill", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok && data.error) {
        setError(data.error);
        return;
      }

      const fileResults: FileResult[] = data.results ?? [];
      setResults(fileResults);

      if (data.allSuccess) {
        setManualFile(null);
        setManualPartial(null);
        setManualDate("");
        formRef.current?.reset();
        router.refresh();
      }
    } catch (err) {
      console.error("[bill-upload] manual-entry submit failed:", err);
      setError(describeFetchError(err));
    } finally {
      setPending(false);
    }
  }

  const successResults = results.filter((r) => r.success);
  const errorResults = results.filter((r) => r.error);

  // After a successful upload the form resets and router.refresh() re-renders
  // the page; without this the HQ user can be left scrolled away from the
  // green "uploaded" summary with no visible sign it worked (same issue the
  // branch upload cards had).
  const outcomeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Not while a file still needs manual entry — the warn form below the
    // main form is where the user needs to be then, not past it.
    if (results.length === 0 || manualFile) return;
    const scroll = () => outcomeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    scroll();
    const t = setTimeout(scroll, 250);
    return () => clearTimeout(t);
  }, [results, manualFile]);

  return (
    <div className="space-y-4">
      {!manualFile && (
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 rounded-md border border-border bg-surface p-5">
          <div>
            <h2 className="text-sm font-semibold text-fg">Upload PDF Bills</h2>
            <p className="mt-0.5 text-xs text-fg-subtle">
              Upload one or more PDF tax invoices. The invoice number, taxable value and invoice date are extracted
              automatically. Anything that can&apos;t be read falls to manual entry. Revenue counts in the month the
              invoice was raised.
            </p>
          </div>

          <div>
            <label htmlFor="bill-category" className="block text-xs font-medium text-fg-muted">
              Revenue type
            </label>
            <select
              id="bill-category"
              name="category"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value as "" | "scrap" | "used_oil")}
              className="mt-1 h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-sm"
            >
              <option value="" disabled>
                Choose Scrap or Used Oil…
              </option>
              <option value="scrap">Scrap revenue</option>
              <option value="used_oil">Used oil revenue</option>
            </select>
            <p className="mt-0.5 text-xs text-fg-faint">Applies to every file in this upload. Counts toward Total Revenue Stream (without tax).</p>
          </div>

          <div>
            <label htmlFor="bill-file" className="block text-xs font-medium text-fg-muted">
              Invoice PDF(s)
            </label>
            <input id="bill-file" name="file" type="file" accept=".pdf" multiple required className="mt-1 block w-full text-sm" />
          </div>

          <div>
            <label htmlFor="bill-fallback-date" className="block text-xs font-medium text-fg-muted">
              Invoice date <span className="font-normal text-fg-faint">— optional</span>
            </label>
            <input
              id="bill-fallback-date"
              name="manualInvoiceDate"
              type="date"
              className="mt-1 h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm"
            />
            <p className="mt-0.5 text-xs text-fg-faint">
              Used only for files whose date can&apos;t be read from the PDF. Handy when backfilling a whole month.
            </p>
          </div>

          {error ? (
            <p role="alert" aria-live="assertive" className="text-sm text-bad">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-60"
          >
            {pending ? (progress ? `Uploading batch ${progress.done + 1} of ${progress.total}…` : "Uploading…") : "Upload"}
          </button>
        </form>
      )}

      {manualFile && (
        <form onSubmit={handleManualSubmit} className="space-y-4 rounded-md border border-warn/30 bg-warn-soft p-5">
          <div>
            <h2 className="text-sm font-semibold text-warn">Manual entry required</h2>
            <p className="mt-0.5 text-xs text-warn">
              Could not auto-extract all fields from <span className="font-medium">{manualFile.name}</span>.
              Please enter the missing values below.
            </p>
          </div>

          <div>
            <label htmlFor="manual-category" className="block text-xs font-medium text-fg-muted">
              Revenue type
            </label>
            <select
              id="manual-category"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value as "" | "scrap" | "used_oil")}
              className="mt-1 h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-sm"
            >
              <option value="" disabled>
                Choose Scrap or Used Oil…
              </option>
              <option value="scrap">Scrap revenue</option>
              <option value="used_oil">Used oil revenue</option>
            </select>
          </div>

          <div>
            <label htmlFor="manual-invoice" className="block text-xs font-medium text-fg-muted">
              Invoice Number
            </label>
            <input
              id="manual-invoice"
              type="text"
              required
              value={manualInvoice}
              onChange={(e) => setManualInvoice(e.target.value)}
              placeholder="e.g. AA26-01514"
              className="mt-1 h-9 w-full rounded-md border border-border-strong px-3 text-sm"
            />
            {manualPartial?.invoiceNumber && (
              <p className="mt-0.5 text-xs text-good">Auto-detected: {manualPartial.invoiceNumber}</p>
            )}
          </div>

          <div>
            <label htmlFor="manual-taxable" className="block text-xs font-medium text-fg-muted">
              Total Taxable Value (Rs)
            </label>
            <input
              id="manual-taxable"
              type="number"
              step="0.01"
              min="0"
              required
              value={manualTaxable}
              onChange={(e) => setManualTaxable(e.target.value)}
              placeholder="e.g. 1203.00"
              className="mt-1 h-9 w-full rounded-md border border-border-strong px-3 text-sm"
            />
            {manualPartial?.taxableValue !== null && manualPartial?.taxableValue !== undefined && (
              <p className="mt-0.5 text-xs text-good">Auto-detected: {manualPartial.taxableValue}</p>
            )}
          </div>

          <div>
            <label htmlFor="manual-date" className="block text-xs font-medium text-fg-muted">
              Invoice Date
            </label>
            <input
              id="manual-date"
              type="date"
              required
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm"
            />
            {manualPartial?.invoiceDate && (
              <p className="mt-0.5 text-xs text-good">Auto-detected: {manualPartial.invoiceDate}</p>
            )}
          </div>

          {error ? (
            <p role="alert" aria-live="assertive" className="text-sm text-bad">{error}</p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save Bill"}
            </button>
            <button
              type="button"
              onClick={() => { setManualFile(null); setManualPartial(null); setResults([]); }}
              className="h-9 rounded-md border border-border-strong px-4 text-sm font-medium text-fg-muted hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div ref={outcomeRef} className="space-y-4">
        {successResults.length > 0 && (
          <div className="rounded-md border border-good/30 bg-good-soft p-4">
            <p className="text-sm font-medium text-good">
              {successResults.length === 1 ? "Bill uploaded successfully" : `${successResults.length} bills uploaded successfully`}
            </p>
            <ul className="mt-2 space-y-1">
              {successResults.map((r) => (
                <li key={r.fileName} className="text-xs text-good">
                  {r.invoiceNumber} — Rs {Number(r.taxableValue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  {r.invoiceDate ? ` — ${r.invoiceDate}` : ""} — {r.fileName}
                </li>
              ))}
            </ul>
          </div>
        )}

        {errorResults.length > 0 && (
          <div className="rounded-md border border-bad/30 bg-bad-soft p-4">
            <p className="text-sm font-medium text-bad">
              {errorResults.length === 1 ? "1 file had an error" : `${errorResults.length} files had errors`}
            </p>
            <ul className="mt-2 space-y-1">
              {errorResults.map((r) => (
                <li key={r.fileName} className="text-xs text-bad">
                  {r.fileName}: {r.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
