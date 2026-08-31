"use client";

import { ReportUploadCard } from "@/components/report-upload-card";
import type { Ssrv089Totals } from "@/lib/ssrv089/parse";

export function Ssrv089GeneralUploadForm({ alreadyUploaded }: { alreadyUploaded?: { sourceFileName: string; uploadedAt: string } | null }) {
  return (
    <ReportUploadCard
      endpoint="/api/upload/ssrv089-general"
      title="Cost and Sales Report - GS"
      description="Feeds GUS Parts/Labour MTD (Accessories staff sales, subtracted from scom205)."
      fileLabel="Cost and Sales Report file (.csv/.xlsx)"
      accept=".csv,.xlsx,.xls"
      formatSuccess={(data) => {
        const t = data.totals as Ssrv089Totals;
        return `Saved for ${data.date}: Accessories Part Sale ₹${t.accessoriesPartSale.toLocaleString("en-IN")}, Accessories Labour Sale ₹${t.accessoriesLabourSale.toLocaleString("en-IN")}.`;
      }}
      alreadyUploaded={alreadyUploaded}
    />
  );
}
