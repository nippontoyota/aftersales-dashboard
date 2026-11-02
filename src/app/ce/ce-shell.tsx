import Link from "next/link";
import type { AdminAccount } from "@/lib/admin-store";
import { AppShell } from "@/components/app-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/lib/actions";
import { MidnightRefresh } from "./midnight-refresh";

type CeSection = "leads" | "avf" | "mrs" | "archive";

const sections = [
  { key: "leads", href: "/ce", label: "Leads overview", description: "Call queue and follow-ups", icon: LeadsIcon },
  { key: "avf", href: "/ce/avf", label: "AVF analytics", description: "Mileage frequency bands", icon: AnalyticsIcon },
  { key: "mrs", href: "/ce/mrs", label: "MRS catch list", description: "Due, missed by TKM's N-9", icon: MrsIcon },
] as const;

function navClass(active: boolean) {
  return `group flex items-center gap-3 rounded-lg px-3 py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
    active ? "bg-accent-soft text-accent-text" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
  }`;
}

export function CeShell({ admin, current, children }: { admin: Extract<AdminAccount, { role: "ce" | "hq" }>; current: CeSection; children: React.ReactNode }) {
  if (admin.role === "hq") {
    return (
      <AppShell current="ce" showDashboardLink isHq identity="HQ admin">
        <MidnightRefresh />
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-4 pb-2 pt-3 sm:px-6" aria-label="CE sections">
          {sections.map((item) => (
            <Link key={item.key} href={item.href} aria-current={current === item.key ? "page" : undefined} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${current === item.key ? "bg-accent-soft text-accent-text" : "text-fg-muted hover:bg-surface-2"}`}>{item.label}</Link>
          ))}
          <Link href="/ce/archive" aria-current={current === "archive" ? "page" : undefined} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${current === "archive" ? "bg-accent-soft text-accent-text" : "text-fg-muted hover:bg-surface-2"}`}>Archive</Link>
        </nav>
        {children}
      </AppShell>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <MidnightRefresh />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <Link href="/ce" className="flex h-20 items-center gap-3 border-b border-border px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-xs font-bold text-on-accent">NT</span>
          <span><span className="block text-sm font-semibold text-fg">Customer Engagement</span><span className="mt-0.5 block text-[11px] text-fg-faint">CE workspace</span></span>
        </Link>

        <nav className="flex-1 space-y-1 p-3" aria-label="CE sections">
          <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">Workspace</p>
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.key} href={item.href} aria-current={current === item.key ? "page" : undefined} className={navClass(current === item.key)}>
                <Icon />
                <span><span className="block text-sm font-medium">{item.label}</span><span className="mt-0.5 block text-[11px] text-fg-faint group-hover:text-fg-subtle">{item.description}</span></span>
              </Link>
            );
          })}
          <p className="px-3 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">Records</p>
          <Link href="/ce/archive" aria-current={current === "archive" ? "page" : undefined} className={navClass(current === "archive")}>
            <ArchiveIcon />
            <span className="text-sm font-medium">Archive</span>
          </Link>
        </nav>

        <div className="border-t border-border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="truncate text-xs font-medium text-fg">{admin.username}</p><p className="text-[10px] uppercase tracking-wide text-fg-faint">CE executive</p></div>
            <ThemeToggle />
          </div>
          <form action={logoutAction}>
            <button className="h-9 w-full rounded-md border border-border px-3 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-64">
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

function LeadsIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0" aria-hidden="true"><path d="M6.5 6.25a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0Z"/><path d="M3.75 17c.4-3.1 2.5-5 6.25-5s5.85 1.9 6.25 5" strokeLinecap="round"/></svg>;
}

function AnalyticsIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0" aria-hidden="true"><path d="M3 16.5h14M4.5 14V9.5h3V14m1-7h3v7m1-10.5h3V14" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function MrsIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0" aria-hidden="true"><path d="M10 5.5v4.5l3 2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="10" cy="10.5" r="6.5"/></svg>;
}

function ArchiveIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0" aria-hidden="true"><path d="M3.5 6.5h13V16h-13zM2.5 3.5h15v3h-15zM8 10h4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
