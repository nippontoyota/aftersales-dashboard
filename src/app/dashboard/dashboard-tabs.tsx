"use client";

import { useState, type ReactNode } from "react";

type TabKey = "overview" | "trends" | "regions" | "insights" | "more";

/**
 * Executive Overview's section switcher (2026-09-15, at the user's request —
 * the page had grown to eight stacked sections and was "too much to scroll
 * through"). The header and HeroKpiStrip stay above this, always visible;
 * everything else renders one tab at a time. Same tab-bar idiom as
 * upload/upload-tabs.tsx.
 */
export function DashboardTabs({
  overview,
  trends,
  regions,
  insights,
  more,
}: {
  overview: ReactNode;
  trends: ReactNode;
  regions: ReactNode;
  insights: ReactNode;
  /** Other KPIs / Bills — omitted entirely when there's nothing to show. */
  more?: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("overview");

  const tabs: { key: TabKey; label: string; show: boolean }[] = [
    { key: "overview", label: "Overview", show: true },
    { key: "trends", label: "Trends", show: true },
    { key: "regions", label: "Regions", show: true },
    { key: "insights", label: "Insights", show: true },
    { key: "more", label: "More", show: more != null },
  ];

  const content: Record<TabKey, ReactNode> = { overview, trends, regions, insights, more };

  return (
    <div>
      <div className="flex flex-wrap border-b border-border">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.key ? "border-b-2 border-accent text-accent-text" : "text-fg-subtle hover:text-fg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
      </div>
      <div className="mt-4">{content[tab]}</div>
    </div>
  );
}
