"use client";

import { ReportUploadCard } from "@/components/report-upload-card";
import type { ServiceInfoCounts } from "@/lib/service-info/parse";

export function ServiceInfoUploadForm({ reportDate, alreadyUploaded }: { reportDate: string; alreadyUploaded?: { sourceFileName: string; uploadedAt: string } | null }) {
  return (
    <ReportUploadCard
      endpoint="/api/upload/service-info"
      title="Service Information Report - GS"
      description="Wheel Balancing, Wheel Alignment, Brake Skimming, Evaporator Cleaning."
      fileLabel="Service Info Report file (.csv/.xlsx)"
      accept=".csv,.xlsx,.xls"
      reportDate={reportDate}
      formatSuccess={(data) => {
        const c = data.counts as ServiceInfoCounts;
        return `Saved for ${data.date}: Wheel Balancing ${c.wheelBalancing}, Wheel Alignment ${c.wheelAlignment}, Brake Skimming ${c.brakeSkimming}, Evaporator Cleaning ${c.evaporatorCleaning}.`;
      }}
      alreadyUploaded={alreadyUploaded}
    />
  );
}
