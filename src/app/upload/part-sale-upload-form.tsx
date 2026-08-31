"use client";

import { ReportUploadCard } from "@/components/report-upload-card";
import type { PartSaleCounts } from "@/lib/part-sale/parse";

export function PartSaleUploadForm({ alreadyUploaded }: { alreadyUploaded?: { sourceFileName: string; uploadedAt: string } | null }) {
  return (
    <ReportUploadCard
      endpoint="/api/upload/part-sale"
      title="Part Sale Report"
      description="Engine Flush, Injector Cleaner, Synthetic Oil, Brake Cleaning Spray, External Sales, DIY."
      fileLabel="Part Sale Report file (.csv/.xlsx)"
      accept=".csv,.xlsx,.xls"
      formatSuccess={(data) => {
        const c = data.counts as PartSaleCounts;
        return `Saved for ${data.date}: Engine Flush ${c.engineFlush}, Injector Cleaner ${c.injectorCleaner}, Synthetic Oil ${c.syntheticOilLtrs} ltrs, Brake Cleaning Spray ${c.brakeCleaningSpray}, External Sales ₹${c.externalSales.toLocaleString("en-IN")}, DIY ${c.diyCount} (₹${c.diyRevenue.toLocaleString("en-IN")}).`;
      }}
      alreadyUploaded={alreadyUploaded}
    />
  );
}
