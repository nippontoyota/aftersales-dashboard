"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { invalidReportDateReason } from "@/lib/reporting-date";

/**
 * Branch Daily Reports date picker. Defaults to the computed report date
 * (`reportingDate()` — the same for every branch this round) but a branch
 * can pick an earlier day to catch one up. Saturdays and HQ-flagged
 * holidays are rejected on pick, with the reason shown — those dates would
 * split one upload round across two dates (see src/lib/reporting-date.ts).
 * `?date=` is re-validated server-side too.
 */
export function ReportDatePicker({ selected, holidays }: { selected: string; holidays: string[] }) {
  const router = useRouter();
  const holidaySet = new Set(holidays);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <input
        id="report-date"
        type="date"
        value={selected}
        max={new Date().toISOString().split("T")[0]}
        onChange={(e) => {
          let value = e.target.value;
          if (!value) return;

          // Auto-correct any 2025 date, or a Jan-Aug 2026 date, to the last
          // day of its month (2026-09-25, at the user's request — these are
          // backfill-only months now, same as 2025; September 2026 onward
          // stays pickable day by day, being the current live month).
          const [year, month] = value.split("-");
          const isBackfillOnlyMonth = year === "2025" || (year === "2026" && Number(month) <= 8);
          if (isBackfillOnlyMonth) {
            const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
            value = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
          }

          const reason = invalidReportDateReason(value, holidaySet);
          if (reason) {
            setError(`${value} is ${reason}. Pick another date.`);
            return;
          }
          setError(null);
          router.push(`/upload?date=${value}`);
        }}
        className="h-9 rounded-md border border-border-strong px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      {error ? <p className="mt-1 text-xs text-bad">{error}</p> : null}
    </>
  );
}
