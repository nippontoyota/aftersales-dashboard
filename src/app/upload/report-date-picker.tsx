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
          const value = e.target.value;
          if (!value) return;
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
