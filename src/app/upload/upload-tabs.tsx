"use client";

import { useState, type ReactNode } from "react";

type TabKey = "reports" | "bills" | "cancellations";

export function UploadTabs({
  dailyReports,
  bills,
  cancellations,
}: {
  dailyReports: ReactNode;
  bills: ReactNode;
  /** HQ-only — omitted for branch accounts. */
  cancellations?: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("reports");

  const tabs: { key: TabKey; label: string; show: boolean }[] = [
    { key: "reports", label: "Daily Reports", show: true },
    { key: "bills", label: "Bills", show: true },
    { key: "cancellations", label: "Cancellations", show: cancellations != null },
  ];

  return (
    <>
      <div className="flex border-b border-border">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.key ? "border-b-2 border-accent text-accent-text" : "text-fg-subtle hover:text-fg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>
      <div className="mt-4">
        {tab === "reports" ? dailyReports : tab === "bills" ? bills : cancellations}
      </div>
    </>
  );
}
