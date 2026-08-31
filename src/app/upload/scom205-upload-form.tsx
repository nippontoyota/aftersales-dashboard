"use client";

import { ReportUploadCard } from "@/components/report-upload-card";
import type { Scom205Totals } from "@/lib/scom205/parse";

export function Scom205UploadForm({ alreadyUploaded }: { alreadyUploaded?: { sourceFileName: string; uploadedAt: string } | null }) {
  return (
    <ReportUploadCard
      endpoint="/api/upload/scom205"
      title="KPI"
      description="GUS/BPU Parts & Labour MTD — values in this file are already month-to-date."
      fileLabel="KPI file (.xls/.xlsx)"
      accept=".xls,.xlsx"
      formatSuccess={(data) => {
        const t = data.totals as Scom205Totals;
        return `Saved for ${data.date}: GUS SP Rev ₹${t.gusSpRevMtd.toLocaleString("en-IN")}, GUS Lab Rev ₹${t.gusLabRevMtd.toLocaleString("en-IN")}, BPU SP Rev ₹${t.bpuSpRevMtd.toLocaleString("en-IN")}, BPU Lab Rev ₹${t.bpuLabRevMtd.toLocaleString("en-IN")}.`;
      }}
      alreadyUploaded={alreadyUploaded}
    />
  );
}
