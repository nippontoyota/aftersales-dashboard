"use client";

import { useRef, useState } from "react";
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

export function BillUploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
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

    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/upload/bill", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok && data.error) {
        setError(data.error);
        return;
      }

      const fileResults: FileResult[] = data.results ?? [];
      setResults(fileResults);

      const needsManual = fileResults.find((r) => r.needsManualEntry);
      if (needsManual) {
        const files = formData.getAll("file") as File[];
        const matchingFile = files.find((f) => f.name === needsManual.fileName);
        if (matchingFile) {
          setManualFile(matchingFile);
          setManualPartial(needsManual.partialData ?? null);
          setManualInvoice(needsManual.partialData?.invoiceNumber ?? "");
          setManualTaxable(needsManual.partialData?.taxableValue?.toString() ?? "");
          setManualDate(needsManual.partialData?.invoiceDate ?? "");
        }
      }

      if (data.allSuccess) {
        formRef.current?.reset();
        router.refresh();
      }
    } catch {
      setError("Upload failed — could not reach the server.");
    } finally {
      setPending(false);
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
    } catch {
      setError("Upload failed — could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  const successResults = results.filter((r) => r.success);
  const errorResults = results.filter((r) => r.error);

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
              className="mt-1 h-9 w-full rounded border border-border-strong bg-surface px-2 text-sm"
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
              className="mt-1 h-9 w-full rounded border border-border-strong bg-surface px-3 text-sm"
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
            className="h-9 rounded bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-60"
          >
            {pending ? "Uploading…" : "Upload"}
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
              className="mt-1 h-9 w-full rounded border border-border-strong bg-surface px-2 text-sm"
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
              className="mt-1 h-9 w-full rounded border border-border-strong px-3 text-sm"
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
              className="mt-1 h-9 w-full rounded border border-border-strong px-3 text-sm"
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
              className="mt-1 h-9 w-full rounded border border-border-strong bg-surface px-3 text-sm"
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
              className="h-9 rounded bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save Bill"}
            </button>
            <button
              type="button"
              onClick={() => { setManualFile(null); setManualPartial(null); setResults([]); }}
              className="h-9 rounded border border-border-strong px-4 text-sm font-medium text-fg-muted hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

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
  );
}
