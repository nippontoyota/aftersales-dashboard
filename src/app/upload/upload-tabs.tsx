"use client";

import { useState, type ReactNode } from "react";

export function UploadTabs({ dailyReports, bills }: { dailyReports: ReactNode; bills: ReactNode }) {
  const [tab, setTab] = useState<"reports" | "bills">("reports");

  return (
    <>
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab("reports")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "reports"
              ? "border-b-2 border-bad text-bad"
              : "text-fg-subtle hover:text-fg-muted"
          }`}
        >
          Daily Reports
        </button>
        <button
          onClick={() => setTab("bills")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "bills"
              ? "border-b-2 border-bad text-bad"
              : "text-fg-subtle hover:text-fg-muted"
          }`}
        >
          Bills
        </button>
      </div>
      <div className="mt-4">
        {tab === "reports" ? dailyReports : bills}
      </div>
    </>
  );
}
