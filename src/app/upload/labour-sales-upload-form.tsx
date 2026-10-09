"use client";

import { ReportUploadCard } from "@/components/report-upload-card";

function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatDateRange(dates: string[]): string {
  if (dates.length === 0) return "";
  if (dates.length === 1) return dates[0];
  return `${dates[0]} – ${dates[dates.length - 1]} (${dates.length} day${dates.length === 1 ? "" : "s"})`;
}

/**
 * Labour Sales Report — the 7th report type (2026-10-06), not wired into
 * any dashboard figure yet. No date field at all: each row's own Doc. Date
 * decides which day it belongs to (see labour-sales/parse.ts), and this
 * form never locks — a re-upload overwrites whichever dates it contains, by
 * design (cumulative backfill files are expected while this is being
 * validated).
 */
export function LabourSalesUploadForm() {
  return (
    <ReportUploadCard
      endpoint="/api/upload/labour-sales"
      title="Labour Sales Report"
      description="RO-level labour lines (before/after discount) — currently used only to spot-check VAS revenue accuracy, not wired into any dashboard figure yet. Upload any range of days; dates come from the file itself."
      fileLabel="Labour Sales Report file (.csv/.xlsx)"
      accept=".csv,.xlsx,.xls"
      noDateField
      formatSuccess={(data) => {
        const dates = (data.dates as string[]) ?? [];
        const totals = data.totals as { rowCount: number; totalLabourAfter: number; vasLabourAfter: number } | undefined;
        const skipped = Number(data.skippedRowCount ?? 0);
        const parts = [`Saved ${formatDateRange(dates)}.`];
        if (totals) {
          parts.push(`${totals.rowCount} rows, labour after discount ${formatInr(totals.totalLabourAfter)}, VAS after discount ${formatInr(totals.vasLabourAfter)}.`);
        }
        if (skipped > 0) parts.push(`${skipped} row(s) had no readable Doc. Date and were skipped.`);
        return parts.join(" ");
      }}
    />
  );
}
