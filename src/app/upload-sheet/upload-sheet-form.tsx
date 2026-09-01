"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { yesterdayIso } from "@/lib/utils";

type DetectedReportType = "service-info" | "part-sale" | "ssrv089" | "scom205";

const TYPE_LABEL: Record<DetectedReportType, string> = {
  "service-info": "Service Information Report - GS",
  "part-sale": "Part Sale Report",
  ssrv089: "Cost and Sales Report - GS",
  scom205: "KPI",
};

type Detection = { type: DetectedReportType; suggestedBranch: string | null; branchCodes: string[]; sourceFileName: string };

/** HQ-only fallback for when a branch admin can't upload themselves —
 * detects the report type from the file itself (reliable: every report
 * type has a real, distinct column/label signature) but always makes HQ
 * confirm the branch rather than guessing — three of the four report types
 * have no branch anywhere in their data, so a filename-based guess is a
 * starting point, never treated as fact. See lib/report-sniffer.ts.
 * SSRV089 uploads always save as the "General" variant now — Body & Paint
 * was dropped entirely (2026-08-31, at the user's request — it never fed
 * any dashboard formula), so there's no variant to choose any more. */
export function UploadSheetForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(yesterdayIso());
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [branch, setBranch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    setDetection(null);
    setBranch("");
    setError(null);
    setSuccess(null);
    if (!picked) return;

    setDetecting(true);
    try {
      const formData = new FormData();
      formData.append("file", picked);
      const res = await fetch("/api/upload-sheet/detect", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not read this file.");
        return;
      }
      setDetection(data);
      setBranch(data.suggestedBranch ?? "");
    } catch {
      setError("Could not reach the server to check this file.");
    } finally {
      setDetecting(false);
    }
  }

  async function handleSave() {
    if (!file || !detection) return;
    if (!branch) {
      setError("Choose which branch this file belongs to.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("date", date);
      formData.append("branch", branch);

      const res = await fetch("/api/upload-sheet/save", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed.");
        return;
      }
      setSuccess(`Saved ${TYPE_LABEL[detection.type]} for ${branch}, ${date}.`);
      setFile(null);
      setDetection(null);
      setBranch("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Could not reach the server to save this file.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Upload Sheet</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          For when a branch can&apos;t upload themselves — pick any Service Information Report, Cost and Sales Report,
          Part Sale Report, or KPI file and the report type is detected automatically. Confirm the branch before
          saving — that part is never guessed.
        </p>
      </div>

      <div>
        <label htmlFor="upload-sheet-date" className="block text-xs font-medium text-slate-600">
          Report date
        </label>
        <input
          id="upload-sheet-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="mt-1 h-9 w-full rounded border border-slate-300 px-3 text-sm"
        />
      </div>

      <div>
        <label htmlFor="upload-sheet-file" className="block text-xs font-medium text-slate-600">
          File (.csv/.xlsx/.xls)
        </label>
        <input
          id="upload-sheet-file"
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileChange}
          className="mt-1 block w-full text-sm"
        />
      </div>

      {detecting ? <p className="text-xs text-slate-400">Checking this file…</p> : null}

      {detection ? (
        <div className="space-y-3 rounded border border-dashed border-slate-200 p-3">
          <div className="text-xs text-slate-600">
            Detected: <span className="font-semibold text-slate-900">{TYPE_LABEL[detection.type]}</span>
          </div>

          <div>
            <label htmlFor="upload-sheet-branch" className="block text-xs font-medium text-slate-600">
              Branch{" "}
              {detection.suggestedBranch ? (
                <span className="font-normal text-slate-400">(suggested from the filename — confirm or change it)</span>
              ) : (
                <span className="font-normal text-slate-400">(couldn&apos;t guess this one — pick it)</span>
              )}
            </label>
            <select
              id="upload-sheet-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              required
              className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm"
            >
              <option value="">Choose a branch…</option>
              {detection.branchCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-9 rounded bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      ) : null}

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
    </div>
  );
}
