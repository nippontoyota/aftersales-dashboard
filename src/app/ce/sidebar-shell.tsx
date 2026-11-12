"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminAccount } from "@/lib/admin-store";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/lib/actions";
import { sections, type CeSection } from "./nav-config";

const icons: Record<(typeof sections)[number]["key"], () => React.ReactNode> = {
  leads: LeadsIcon,
  avf: AnalyticsIcon,
  mrs: MrsIcon,
  conquest: ConquestIcon,
  reports: ReportsIcon,
};

function navClass(active: boolean) {
  return `group flex items-center gap-3 rounded-lg px-3 py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
    active ? "bg-accent-soft text-accent-text" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
  }`;
}

// Per-browser UI convenience only (not shared state) — same localStorage
// pattern as theme-toggle.tsx, without that component's cross-tab sync
// (not needed here: a stale collapse state in another tab is harmless).
const STORAGE_KEY = "ce-sidebar-collapsed";

function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* storage blocked — stays expanded for this page view */
    }
  }, []);
  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* storage blocked — toggle still works for this page view */
      }
      return next;
    });
  };
  return [collapsed, toggle];
}

export function CeSidebarShell({ admin, current, children }: { admin: Extract<AdminAccount, { role: "ce_head" | "ce_agent" }>; current: CeSection; children: React.ReactNode }) {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const asideWidth = collapsed ? "lg:w-[76px]" : "lg:w-64";
  const contentPad = collapsed ? "lg:pl-[76px]" : "lg:pl-64";

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <aside className={`fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface transition-[width] duration-150 lg:flex ${asideWidth}`}>
        <div className="flex h-20 items-center gap-3 border-b border-border px-5">
          <Link href="/ce" className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-bold text-on-accent">NT</span>
            {!collapsed ? <span className="min-w-0"><span className="block truncate text-sm font-semibold text-fg">Customer Engagement</span><span className="mt-0.5 block text-[11px] text-fg-faint">CE workspace</span></span> : null}
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="CE sections">
          {!collapsed ? <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">Workspace</p> : null}
          {sections.map((item) => {
            const Icon = icons[item.key];
            return (
              <Link key={item.key} href={item.href} aria-current={current === item.key ? "page" : undefined} title={collapsed ? item.label : undefined} className={navClass(current === item.key)}>
                <Icon />
                {!collapsed ? <span><span className="block text-sm font-medium">{item.label}</span><span className="mt-0.5 block text-[11px] text-fg-faint group-hover:text-fg-subtle">{item.description}</span></span> : null}
              </Link>
            );
          })}
          {!collapsed ? <p className="px-3 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">Records</p> : null}
          <Link href="/ce/archive" aria-current={current === "archive" ? "page" : undefined} title={collapsed ? "Archive" : undefined} className={navClass(current === "archive")}>
            <ArchiveIcon />
            {!collapsed ? <span className="text-sm font-medium">Archive</span> : null}
          </Link>
        </nav>

        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="mb-3 flex h-9 w-full items-center justify-center rounded-md border border-border text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <CollapseIcon collapsed={collapsed} />
          </button>
          {!collapsed ? (
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="truncate text-xs font-medium text-fg">{admin.username}</p><p className="text-[10px] uppercase tracking-wide text-fg-faint">{admin.role === "ce_head" ? "CE head" : "CE agent"}</p></div>
              <ThemeToggle />
            </div>
          ) : (
            <div className="mb-3 flex justify-center"><ThemeToggle /></div>
          )}
          <form action={logoutAction}>
            <button className="h-9 w-full rounded-md border border-border px-3 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{collapsed ? "Out" : "Sign out"}</button>
          </form>
        </div>
      </aside>

      <div className={`transition-[padding] duration-150 ${contentPad}`}>
        <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center gap-3 px-4">
            <Link href="/ce" className="flex min-w-0 items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-bold text-on-accent">NT</span>
              <span className="truncate text-sm font-semibold">Customer Engagement</span>
            </Link>
            <ThemeToggle className="ml-auto" />
            <form action={logoutAction}><button className="h-8 rounded-md border border-border px-2.5 text-xs font-medium text-fg-muted">Sign out</button></form>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="CE sections">
            {sections.map((item) => <Link key={item.key} href={item.href} aria-current={current === item.key ? "page" : undefined} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${current === item.key ? "bg-accent-soft text-accent-text" : "text-fg-muted"}`}>{item.label}</Link>)}
            <Link href="/ce/archive" aria-current={current === "archive" ? "page" : undefined} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${current === "archive" ? "bg-accent-soft text-accent-text" : "text-fg-muted"}`}>Archive</Link>
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} aria-hidden="true">
      <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LeadsIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0" aria-hidden="true"><path d="M6.5 6.25a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0Z"/><path d="M3.75 17c.4-3.1 2.5-5 6.25-5s5.85 1.9 6.25 5" strokeLinecap="round"/></svg>;
}

function AnalyticsIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0" aria-hidden="true"><path d="M3 16.5h14M4.5 14V9.5h3V14m1-7h3v7m1-10.5h3V14" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function MrsIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0" aria-hidden="true"><path d="M10 5.5v4.5l3 2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="10" cy="10.5" r="6.5"/></svg>;
}

function ConquestIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 7v3l2 1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 3v1.5M17 10h-1.5M10 17v-1.5M3 10h1.5" strokeLinecap="round" /></svg>;
}

function ReportsIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0" aria-hidden="true"><path d="M4 16.5h12M6 14v-3.5M10 14V6M14 14v-6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ArchiveIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0" aria-hidden="true"><path d="M3.5 6.5h13V16h-13zM2.5 3.5h15v3h-15zM8 10h4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
