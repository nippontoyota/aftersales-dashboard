"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type FileResult = {
  fileName: string;
  success?: boolean;
  invoiceNumber?: string;
  taxableValue?: number;
  error?: string;
  needsManualEntry?: boolean;
  partialData?: { invoiceNumber: string | null; taxableValue: number | null };
};

export function BillUploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualInvoice, setManualInvoice] = useState("");
  const [manualTaxable, setManualTaxable] = useState("");
  const [manualPartial, setManualPartial] = useState<{ invoiceNumber: string | null; taxableValue: number | null } | null>(null);

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
    formData.set("manualInvoiceNumber", manualInvoice);
    formData.set("manualTaxableValue", manualTaxable);

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
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 rounded-md border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Upload PDF Bills</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Upload one or more PDF tax invoices. The invoice number and total taxable value will be extracted
              automatically. If extraction fails, you can enter the values manually.
            </p>
          </div>

          <div>
            <label htmlFor="bill-file" className="block text-xs font-medium text-slate-600">
              Invoice PDF(s)
            </label>
            <input id="bill-file" name="file" type="file" accept=".pdf" multiple required className="mt-1 block w-full text-sm" />
          </div>

          {error ? (
            <p role="alert" aria-live="assertive" className="text-sm text-red-600">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 disabled:opacity-60"
          >
            {pending ? "Uploading…" : "Upload"}
          </button>
        </form>
      )}

      {manualFile && (
        <form onSubmit={handleManualSubmit} className="space-y-4 rounded-md border border-amber-200 bg-amber-50 p-5">
          <div>
            <h2 className="text-sm font-semibold text-amber-900">Manual entry required</h2>
            <p className="mt-0.5 text-xs text-amber-700">
              Could not auto-extract all fields from <span className="font-medium">{manualFile.name}</span>.
              Please enter the missing values below.
            </p>
          </div>

          <div>
            <label htmlFor="manual-invoice" className="block text-xs font-medium text-slate-600">
              Invoice Number
            </label>
            <input
              id="manual-invoice"
              type="text"
              required
              value={manualInvoice}
              onChange={(e) => setManualInvoice(e.target.value)}
              placeholder="e.g. AA26-01514"
              className="mt-1 h-9 w-full rounded border border-slate-300 px-3 text-sm"
            />
            {manualPartial?.invoiceNumber && (
              <p className="mt-0.5 text-xs text-emerald-600">Auto-detected: {manualPartial.invoiceNumber}</p>
            )}
          </div>

          <div>
            <label htmlFor="manual-taxable" className="block text-xs font-medium text-slate-600">
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
              className="mt-1 h-9 w-full rounded border border-slate-300 px-3 text-sm"
            />
            {manualPartial?.taxableValue !== null && manualPartial?.taxableValue !== undefined && (
              <p className="mt-0.5 text-xs text-emerald-600">Auto-detected: {manualPartial.taxableValue}</p>
            )}
          </div>

          {error ? (
            <p role="alert" aria-live="assertive" className="text-sm text-red-600">{error}</p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="h-9 rounded bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save Bill"}
            </button>
            <button
              type="button"
              onClick={() => { setManualFile(null); setManualPartial(null); setResults([]); }}
              className="h-9 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {successResults.length > 0 && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">
            {successResults.length === 1 ? "Bill uploaded successfully" : `${successResults.length} bills uploaded successfully`}
          </p>
          <ul className="mt-2 space-y-1">
            {successResults.map((r) => (
              <li key={r.fileName} className="text-xs text-emerald-800">
                {r.invoiceNumber} — Rs {Number(r.taxableValue).toLocaleString("en-IN", { minimumFractionDigits: 2 })} — {r.fileName}
              </li>
            ))}
          </ul>
        </div>
      )}

      {errorResults.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-900">
            {errorResults.length === 1 ? "1 file had an error" : `${errorResults.length} files had errors`}
          </p>
          <ul className="mt-2 space-y-1">
            {errorResults.map((r) => (
              <li key={r.fileName} className="text-xs text-red-700">
                {r.fileName}: {r.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
