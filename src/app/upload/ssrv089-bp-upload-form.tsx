"use client";

import { ReportUploadCard } from "@/components/report-upload-card";

/** Required daily upload, but nothing is parsed out of it yet (2026-09-01,
 * at the user's request) — the file is just kept for the record. */
export function Ssrv089BpUploadForm({ reportDate, alreadyUploaded }: { reportDate: string; alreadyUploaded?: { sourceFileName: string; uploadedAt: string } | null }) {
  return (
    <ReportUploadCard
      endpoint="/api/upload/ssrv089-bp"
      title="Cost and Sales Report - BP"
      description="Stored on file — not parsed into any dashboard figure yet."
      fileLabel="Cost and Sales Report file (.csv/.xlsx)"
      accept=".csv,.xlsx,.xls"
      reportDate={reportDate}
      formatSuccess={(data) => `Saved for ${data.date} — ${data.sourceFileName}.`}
      alreadyUploaded={alreadyUploaded}
    />
  );
}
