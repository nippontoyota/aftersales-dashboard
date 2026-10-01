import { logoutAction } from "@/lib/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The CEO's own bare page shell (2026-10-01, replacing AppShell's sidebar +
 * nav for this role entirely, at the user's request — same treatment
 * VpShell already got 2026-09-26). AppShell's CEO_NAV_ITEMS was always just
 * one entry ("Overview"), so the sidebar was pure chrome around a single
 * destination (/ceo/branches is reached by clicking a region, never a nav
 * item). A thin top strip (brand mark + identity + theme toggle + sign out)
 * and nothing else.
 */
export function CeoShell({ identity, children }: { identity: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-fg">
      <AutoRefresh />
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 print:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-bold text-on-accent">NT</div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-fg">Nippon Toyota</div>
            <div className="truncate text-[11px] text-fg-faint">{identity}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
