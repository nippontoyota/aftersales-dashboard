"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { yesterdayIso } from "@/lib/utils";

type DetectedReportType = "service-info" | "part-sale" | "ssrv089" | "scom205";
type Variant = "gs" | "bp";

const TYPE_LABEL: Record<DetectedReportType, string> = {
  "service-info": "Service Information Report",
  "part-sale": "Part Sale Report",
  ssrv089: "Cost and Sales Report",
  scom205: "KPI",
};

/** Only Service Info and Cost and Sales split into GS/BP — Part Sale and
 * KPI have no such variant, so the picker only shows up for those two. */
const HAS_VARIANT: Record<DetectedReportType, boolean> = {
  "service-info": true,
  "part-sale": false,
  ssrv089: true,
  scom205: false,
};

type Detection = { type: DetectedReportType; suggestedBranch: string | null; branchCodes: string[]; sourceFileName: string };

/** HQ-only fallback for when a branch admin can't upload themselves —
 * detects the report type from the file itself (reliable: every report
 * type has a real, distinct column/label signature) but always makes HQ
 * confirm the branch rather than guessing — three of the four base report
 * types have no branch anywhere in their data, so a filename-based guess is
 * a starting point, never treated as fact. See lib/report-sniffer.ts.
 *
 * Service Info and Cost and Sales each come as two variants — GS and BP —
 * that share the same file signature (the sniffer can only tell "this is a
 * Service Info-shaped file," not which variant), so HQ picks GS/BP by hand
 * here, same as the file's own upload button would already disambiguate on
 * the branch's own /upload page. BP saves the file as-is, unparsed — see
 * raw-report-uploads/store.ts. (2026-09-01, at the user's request.) */
export function UploadSheetForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(yesterdayIso());
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [branch, setBranch] = useState("");
  const [variant, setVariant] = useState<Variant>("gs");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    setDetection(null);
    setBranch("");
    setVariant("gs");
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
      if (HAS_VARIANT[detection.type]) formData.append("variant", variant);

      const res = await fetch("/api/upload-sheet/save", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed.");
        return;
      }
      const label = HAS_VARIANT[detection.type] ? `${TYPE_LABEL[detection.type]} - ${variant.toUpperCase()}` : TYPE_LABEL[detection.type];
      setSuccess(`Saved ${label} for ${branch}, ${date}.`);
      setFile(null);
      setDetection(null);
      setBranch("");
      setVariant("gs");
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Could not reach the server to save this file.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-border bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold text-fg">Upload Sheet</h2>
        <p className="mt-0.5 text-xs text-fg-subtle">
          For when a branch can&apos;t upload themselves — pick any Service Information Report, Cost and Sales Report,
          Part Sale Report, or KPI file and the report type is detected automatically. Confirm the branch (and, for
          Service Info / Cost and Sales, the GS or BP variant) before saving — neither is ever guessed.
        </p>
      </div>

      <div>
        <label htmlFor="upload-sheet-date" className="block text-xs font-medium text-fg-muted">
          Report date
        </label>
        <input
          id="upload-sheet-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="mt-1 h-9 w-full rounded border border-border-strong px-3 text-sm"
        />
      </div>

      <div>
        <label htmlFor="upload-sheet-file" className="block text-xs font-medium text-fg-muted">
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

      {detecting ? <p className="text-xs text-fg-faint">Checking this file…</p> : null}

      {detection ? (
        <div className="space-y-3 rounded border border-dashed border-border p-3">
          <div className="text-xs text-fg-muted">
            Detected: <span className="font-semibold text-fg">{TYPE_LABEL[detection.type]}</span>
          </div>

          {HAS_VARIANT[detection.type] ? (
            <div>
              <label className="block text-xs font-medium text-fg-muted">Variant</label>
              <div className="mt-1 flex gap-3 text-sm">
                <label className="inline-flex items-center gap-1.5">
                  <input type="radio" name="variant" checked={variant === "gs"} onChange={() => setVariant("gs")} />
                  GS
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="radio" name="variant" checked={variant === "bp"} onChange={() => setVariant("bp")} />
                  BP
                </label>
              </div>
            </div>
          ) : null}

          <div>
            <label htmlFor="upload-sheet-branch" className="block text-xs font-medium text-fg-muted">
              Branch{" "}
              {detection.suggestedBranch ? (
                <span className="font-normal text-fg-faint">(suggested from the filename — confirm or change it)</span>
              ) : (
                <span className="font-normal text-fg-faint">(couldn&apos;t guess this one — pick it)</span>
              )}
            </label>
            <select
              id="upload-sheet-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              required
              className="mt-1 h-9 w-full rounded border border-border-strong px-2 text-sm"
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
            className="h-9 rounded bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      ) : null}

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
    </div>
  );
}
