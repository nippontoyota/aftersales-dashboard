"use client";

import { ReportUploadCard } from "@/components/report-upload-card";
import type { PartSaleCounts } from "@/lib/part-sale/parse";

export function PartSaleUploadForm({ reportDate, alreadyUploaded }: { reportDate: string; alreadyUploaded?: { sourceFileName: string; uploadedAt: string } | null }) {
  return (
    <ReportUploadCard
      endpoint="/api/upload/part-sale"
      title="Part Sale Report"
      description="Engine Flush, Injector Cleaner, Synthetic Oil, Brake Cleaning Spray, External Sales, DIY."
      fileLabel="Part Sale Report file (.csv/.xlsx)"
      accept=".csv,.xlsx,.xls"
      reportDate={reportDate}
      formatSuccess={(data) => {
        const c = data.counts as PartSaleCounts;
        return `Saved for ${data.date}: Engine Flush ${c.engineFlush}, Injector Cleaner ${c.injectorCleaner}, Synthetic Oil ${c.syntheticOilLtrs} ltrs, Brake Cleaning Spray ${c.brakeCleaningSpray}, External Sales ₹${c.externalSales.toLocaleString("en-IN")}, DIY ${c.diyCount} (₹${c.diyRevenue.toLocaleString("en-IN")}).`;
      }}
      alreadyUploaded={alreadyUploaded}
    />
  );
}

/** Only shown to a parent branch that has an online-store code (currently
 * just CO01A -> CO01C) — see onlineStoreCodeFor() in report.ts. Optional:
 * the online store doesn't sell something every day, so there's no
 * "already uploaded" pressure to file one when there's nothing to report —
 * this simply isn't in any branch's required-uploads set. */
export function OnlineStorePartSaleUploadForm({ reportDate, alreadyUploaded }: { reportDate: string; alreadyUploaded?: { sourceFileName: string; uploadedAt: string } | null }) {
  return (
    <ReportUploadCard
      endpoint="/api/upload/part-sale-online"
      title="Online Store Part Sale Report"
      description="Your online store's own Part Sale Report — only upload one on a day it actually sold something. Its External Sales folds into your branch's own total."
      fileLabel="Online Store Part Sale Report file (.csv/.xlsx)"
      accept=".csv,.xlsx,.xls"
      reportDate={reportDate}
      formatSuccess={(data) => {
        const c = data.counts as PartSaleCounts;
        return `Saved for ${data.date}: Engine Flush ${c.engineFlush}, Injector Cleaner ${c.injectorCleaner}, Synthetic Oil ${c.syntheticOilLtrs} ltrs, Brake Cleaning Spray ${c.brakeCleaningSpray}, External Sales ₹${c.externalSales.toLocaleString("en-IN")}, DIY ${c.diyCount} (₹${c.diyRevenue.toLocaleString("en-IN")}).`;
      }}
      alreadyUploaded={alreadyUploaded}
    />
  );
}
