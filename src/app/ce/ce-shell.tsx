import Link from "next/link";
import type { AdminAccount } from "@/lib/admin-store";
import { AppShell } from "@/components/app-shell";
import { MidnightRefresh } from "./midnight-refresh";
import { CeSidebarShell, sections, type CeSection } from "./sidebar-shell";

export function CeShell({ admin, current, children }: { admin: Extract<AdminAccount, { role: "ce_head" | "ce_agent" | "hq" }>; current: CeSection; children: React.ReactNode }) {
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
    <CeSidebarShell admin={admin} current={current}>
      <MidnightRefresh />
      {children}
    </CeSidebarShell>
  );
}
