"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { logoutAction } from "@/lib/actions";

// Every branch admin sees the full company-wide dashboard, identical to HQ
// (2026-08-29's "locked to own branch" reversed 2026-08-31, at the user's
// request) — so nothing here is HQ-only any more. What's actually visible
// day-to-day is gated by publish status instead (see dashboard-data.ts),
// not by nav item.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", key: "dashboard" as const, requiresDashboard: true, companyWide: false },
  { href: "/tkm-targets", label: "TKM Targets", key: "tkm-targets" as const, requiresDashboard: true, companyWide: true },
  { href: "/alerts", label: "Alerts", key: "alerts" as const, requiresDashboard: true, companyWide: true },
  { href: "/branches", label: "Branches", key: "branches" as const, requiresDashboard: true, companyWide: true },
  { href: "/reports", label: "Reports", key: "reports" as const, requiresDashboard: true, companyWide: true },
  { href: "/upload", label: "Upload", key: "upload" as const, requiresDashboard: false, companyWide: false },
];

/** HQ-only tools, kept apart from the day-to-day nav above — administrative
 * rather than something anyone checks routinely, so they sit as a small
 * link list near the account area at the bottom instead of the main list. */
const UTILITY_NAV_ITEMS = [
  // HQ-managed reference data (Accessories staff today, more datasets to
  // come) — an HQ admin edits these directly, no code change/redeploy
  // needed when e.g. staff turns over.
  { href: "/data", label: "Data", key: "data" as const },
  // Fallback for uploading a branch's report on their behalf (someone's on
  // leave, an issue on their side) — report type auto-detected, branch
  // always confirmed by hand, never guessed. See /upload-sheet.
  { href: "/upload-sheet", label: "Upload Sheet", key: "upload-sheet" as const },
];

type NavKey = (typeof NAV_ITEMS)[number]["key"] | (typeof UTILITY_NAV_ITEMS)[number]["key"];

function DashboardIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <rect x="2.5" y="2.5" width="6" height="8" rx="1" />
      <rect x="11.5" y="2.5" width="6" height="5" rx="1" />
      <rect x="11.5" y="10.5" width="6" height="7" rx="1" />
      <rect x="2.5" y="13.5" width="6" height="4" rx="1" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <path d="M10 12.5V3.5M10 3.5l-3.5 3.5M10 3.5l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 13.5v1.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TkmTargetsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3.8" />
      <circle cx="10" cy="10" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function AlertsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <path d="M5 8a5 5 0 0 1 10 0c0 3.5 1.2 4.8 1.2 4.8H3.8S5 11.5 5 8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.3 15.5a1.8 1.8 0 0 0 3.4 0" strokeLinecap="round" />
    </svg>
  );
}

function BranchesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <path d="M5 3v6a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 12v5" strokeLinecap="round" />
      <circle cx="5" cy="3" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="10" cy="17" r="1.6" />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <path d="M5 3.5h7l3 3v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z" strokeLinejoin="round" />
      <path d="M7 10h6M7 13h6M7 7h2.5" strokeLinecap="round" />
    </svg>
  );
}

function DataIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <ellipse cx="10" cy="4.5" rx="6" ry="2.2" />
      <path d="M4 4.5v5c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2v-5" strokeLinecap="round" />
      <path d="M4 9.5v5c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2v-5" strokeLinecap="round" />
    </svg>
  );
}

function UploadSheetIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <path d="M5 3.5h7l3 3v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z" strokeLinejoin="round" />
      <path d="M10 8v6M7.3 10.7 10 8l2.7 2.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Sidebar collapse/expand toggle — a panel with a divider bar, same idiom
 * as the reference the user pointed at. */
function PanelIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <path d="M7.75 3.5v13" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" strokeLinecap="round" />
      <path d="M12.5 13.5 16 10l-3.5-3.5M16 10H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SIDEBAR_STORAGE_KEY = "nt-sidebar-collapsed";
const SIDEBAR_EVENT = "nt-sidebar-change";

/** Desktop sidebar collapsed-state, backed by localStorage so it survives
 * navigation and stays in sync across tabs. useSyncExternalStore keeps SSR
 * (always expanded) and the client in step without a setState-in-effect. */
function subscribeSidebar(onChange: () => void): () => void {
  window.addEventListener(SIDEBAR_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SIDEBAR_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => false);
  const toggle = () => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "0" : "1");
    } catch {
      /* private mode / storage blocked — no persistence, but still toggle for this view */
    }
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  };
  return [collapsed, toggle];
}

const ICONS: Record<NavKey, () => React.ReactElement> = {
  dashboard: DashboardIcon,
  "tkm-targets": TkmTargetsIcon,
  alerts: AlertsIcon,
  branches: BranchesIcon,
  reports: ReportsIcon,
  upload: UploadIcon,
  data: DataIcon,
  "upload-sheet": UploadSheetIcon,
};

export function AppShell({
  current,
  showDashboardLink,
  isHq = false,
  companyTabs = true,
  dashboardLabel = "Dashboard",
  identity,
  children,
}: {
  current: NavKey;
  showDashboardLink: boolean;
  /** Gates the HQ-only "Data"/"Upload Sheet" utility items AND the
   * company-wide Alerts/Branches/Reports nav items — defaults to false so
   * every existing call site (branch admins see neither) doesn't need
   * updating just to opt out. */
  isHq?: boolean;
  /** When false, the company-wide tabs (TKM Targets, Alerts, Branches,
   * Reports) are hidden — a branch admin whose latest date isn't published
   * yet only gets Daily Report + Upload. Defaults to true. */
  companyTabs?: boolean;
  /** Label for the /dashboard nav item — "Daily Report" for a branch admin
   * on the pre-publish raw view, "Dashboard" otherwise. */
  dashboardLabel?: string;
  /** e.g. "CO01B branch" or "HQ admin" — shown under the account area at the bottom of the sidebar. */
  identity: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop-only: collapse the sidebar to an icon rail. Persisted per browser
  // so it survives navigation; SSR always renders it expanded, then the
  // client syncs to the stored value on hydration.
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  const items = NAV_ITEMS.filter(
    (item) => (!item.requiresDashboard || showDashboardLink) && (!item.companyWide || companyTabs),
  ).map((item) => (item.key === "dashboard" ? { ...item, label: dashboardLabel } : item));
  const utilityItems = isHq ? UTILITY_NAV_ITEMS : [];

  const navLink = (item: { href: string; label: string; key: NavKey }, compact: boolean) => {
    const Icon = ICONS[item.key];
    const active = current === item.key;
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={() => setMobileOpen(false)}
        title={compact ? item.label : undefined}
        className={`flex items-center rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
          compact ? "justify-center px-2 py-2" : "gap-2.5 px-3 py-2"
        } ${active ? "bg-red-50 text-red-700" : "text-slate-600 hover:bg-slate-50"}`}
      >
        <Icon />
        {!compact && item.label}
      </Link>
    );
  };

  /** `compact` collapses to the icon rail (desktop only). `desktop` gates the
   * collapse/expand toggle so the mobile slide-over never shows it. */
  const renderSidebar = (compact: boolean, desktop: boolean) => (
    <>
      <div className={`flex h-14 shrink-0 items-center border-b border-slate-100 ${compact ? "justify-center px-2" : "gap-2 px-4"}`}>
        {compact ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Open sidebar"
            title="Open sidebar"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <PanelIcon />
          </button>
        ) : (
          <>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-600 text-xs font-bold text-white">NT</div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-slate-900">Nippon Toyota</div>
              <div className="truncate text-[11px] text-slate-400">Aftersales Intelligence</div>
            </div>
            {desktop ? (
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="ml-auto shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                <PanelIcon />
              </button>
            ) : null}
          </>
        )}
      </div>

      <nav className={`flex-1 space-y-0.5 ${compact ? "p-2" : "p-3"}`}>{items.map((item) => navLink(item, compact))}</nav>

      {utilityItems.length > 0 ? (
        <nav className={`space-y-0.5 border-t border-slate-100 ${compact ? "p-2" : "p-3"}`}>
          {utilityItems.map((item) => navLink(item, compact))}
        </nav>
      ) : null}

      <div className={`border-t border-slate-100 ${compact ? "p-2" : "p-3"}`}>
        {!compact ? <div className="mb-2 truncate px-1 text-[11px] text-slate-400">{identity}</div> : null}
        <form action={logoutAction}>
          <button
            type="submit"
            title={compact ? "Sign out" : undefined}
            aria-label={compact ? "Sign out" : undefined}
            className={
              compact
                ? "flex w-full items-center justify-center rounded-md border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                : "w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            }
          >
            {compact ? <SignOutIcon /> : "Sign out"}
          </button>
        </form>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar — collapsible to an icon rail */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex ${
          collapsed ? "w-14" : "w-56"
        }`}
      >
        {renderSidebar(collapsed, true)}
      </aside>

      {/* Mobile sidebar (slide-over) — always full, no collapse toggle */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-56 flex-col bg-white shadow-lg">{renderSidebar(false, false)}</aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-slate-900">Nippon Toyota</span>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
