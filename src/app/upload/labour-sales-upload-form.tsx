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
 * decides which day it belongs to (see labour-sales/parse.ts).
 *
 * Locks the same way the other six do (2026-10-09, at the user's request —
 * the earlier "never locks, always re-uploadable" version was confusing
 * since it never turned green like the others): `alreadyUploaded` is
 * whether a labour_sales_snapshots row already exists for the shared
 * `reportDate`, same check pending-uploads.ts uses. A branch that needs to
 * correct or add to an already-locked date goes through HQ's Upload Sheet,
 * same as every other report — the backend itself still overwrites
 * whichever dates a file contains either way (see the upload route), this
 * only changes whether a BRANCH can self-service a second upload the same
 * day.
 */
export function LabourSalesUploadForm({ alreadyUploaded }: { alreadyUploaded?: { sourceFileName: string; uploadedAt: string } | null }) {
  return (
    <ReportUploadCard
      endpoint="/api/upload/labour-sales"
      title="Labour Sales Report"
      description="RO-level labour lines (before/after discount) — currently used only to spot-check VAS revenue accuracy, not wired into any dashboard figure yet. Upload any range of days; dates come from the file itself."
      fileLabel="Labour Sales Report file (.csv/.xlsx)"
      accept=".csv,.xlsx,.xls"
      noDateField
      alreadyUploaded={alreadyUploaded}
      formatSuccess={(data) => {
        const dates = (data.dates as string[]) ?? [];
        const totals = data.totals as { rowCount: number; vasLabourBefore: number; vasLabourAfter: number } | undefined;
        const skipped = Number(data.skippedRowCount ?? 0);
        const parts = [`Saved ${formatDateRange(dates)}.`];
        if (totals) {
          parts.push(`${totals.rowCount} rows. VAS after discount ${formatInr(totals.vasLabourAfter)} (before discount ${formatInr(totals.vasLabourBefore)}).`);
        }
        if (skipped > 0) parts.push(`${skipped} row(s) had no readable Doc. Date and were skipped.`);
        return parts.join(" ");
      }}
    />
  );
}
