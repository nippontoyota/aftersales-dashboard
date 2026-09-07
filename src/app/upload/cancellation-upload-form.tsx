"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Saved = { branch: string; month: string; count: number; beforeTaxTotal: number; afterTaxTotal: number };
type FileResult = { fileName: string; saved: Saved[]; error?: string };

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
};

export function CancellationUploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setResults([]);

    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/upload/cancellation", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok && data.error) {
        setError(data.error);
        return;
      }
      setResults(data.results ?? []);
      if (data.allOk) {
        formRef.current?.reset();
        router.refresh();
      }
    } catch {
      setError("Upload failed — could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
        <input
          type="file"
          name="file"
          accept="application/pdf"
          multiple
          required
          className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-text hover:file:bg-accent-soft/80"
        />
        <p className="text-xs text-fg-subtle">
          The branch and month are read from each file&apos;s header. Re-uploading a month replaces that month&apos;s rows.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-bad px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </form>

      {error ? (
        <div className="rounded border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{error}</div>
      ) : null}

      {results.map((r) => (
        <div key={r.fileName} className="rounded-md border border-border bg-surface p-3 text-sm">
          <div className="font-medium text-fg">{r.fileName}</div>
          {r.error ? (
            <div className="mt-1 text-bad">{r.error}</div>
          ) : (
            <ul className="mt-1 space-y-0.5 text-fg-muted">
              {r.saved.map((s) => (
                <li key={`${s.branch}-${s.month}`}>
                  <span className="font-medium text-fg">{s.branch}</span> · {monthLabel(s.month)} — {s.count} cancellations,{" "}
                  {inr(s.beforeTaxTotal)} before tax ({inr(s.afterTaxTotal)} incl.)
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
