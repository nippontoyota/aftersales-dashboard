"use client";

import { useRouter } from "next/navigation";

/** Single date picker at the top of the branch Daily Reports panel. Defaults
 * to yesterday (the day branches normally upload for); changing it re-runs
 * the page for that date, so the lock status of every section and the date
 * each upload is filed under both follow the picker — the way a branch
 * catches up a day they missed. */
export function ReportDatePicker({ selected }: { selected: string }) {
  const router = useRouter();

  return (
    <input
      id="report-date"
      type="date"
      value={selected}
      max={new Date().toISOString().split("T")[0]}
      onChange={(e) => {
        if (e.target.value) {
          router.push(`/upload?date=${e.target.value}`);
        }
      }}
      className="h-9 rounded border border-border-strong px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    />
  );
}
