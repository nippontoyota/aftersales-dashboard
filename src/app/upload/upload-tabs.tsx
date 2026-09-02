"use client";

import { useState, type ReactNode } from "react";

export function UploadTabs({ dailyReports, bills }: { dailyReports: ReactNode; bills: ReactNode }) {
  const [tab, setTab] = useState<"reports" | "bills">("reports");

  return (
    <>
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setTab("reports")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "reports"
              ? "border-b-2 border-red-600 text-red-700"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Daily Reports
        </button>
        <button
          onClick={() => setTab("bills")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "bills"
              ? "border-b-2 border-red-600 text-red-700"
              : "text-slate-500 hover:text-slate-700"
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
