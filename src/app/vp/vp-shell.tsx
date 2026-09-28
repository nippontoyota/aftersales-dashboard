import { logoutAction } from "@/lib/actions";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The VP's own bare page shell (2026-09-26, replacing AppShell's sidebar +
 * nav for this role entirely, at the VP's request — "just his one page").
 * A thin top strip (brand mark + theme toggle + sign out) and nothing
 * else — no nav links, no tabs. Regions and Queries, formerly their own nav
 * items, are now a section on the one page and the corner popup
 * respectively (see vp-queries-popup.tsx).
 */
export function VpShell({ identity, children }: { identity: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-fg">
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
