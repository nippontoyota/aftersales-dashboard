"use client";

import { ReportUploadCard } from "@/components/report-upload-card";

export function BaToolUploadForm() {
  return (
    <ReportUploadCard
      endpoint="/api/upload/ba-tool"
      title="BA Tool Report"
      description="Company-wide daily export — all branches in one file."
      fileLabel="BA Tool file (.xlsx)"
      accept=".xlsx,.xls"
      formatSuccess={(data) => {
        const unmatched = data.unmatchedColumns as string[] | undefined;
        const unmatchedNote =
          unmatched && unmatched.length > 0
            ? ` (${unmatched.length} unused column(s) in the file: ${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? "…" : ""})`
            : "";
        return `Saved ${data.branchCount} branch rows for ${data.date}.${unmatchedNote}`;
      }}
    />
  );
}
