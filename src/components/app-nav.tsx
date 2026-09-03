import Link from "next/link";
import { logoutAction } from "@/lib/actions";

export function AppNav({ current, showDashboardLink }: { current: "upload" | "dashboard"; showDashboardLink: boolean }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-fg">Nippon Toyota — Admin Portal</span>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/upload"
            aria-current={current === "upload" ? "page" : undefined}
            className={`rounded px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${current === "upload" ? "bg-accent text-on-accent" : "text-fg-muted hover:bg-surface-2"}`}
          >
            Upload
          </Link>
          {showDashboardLink ? (
            <Link
              href="/dashboard"
              aria-current={current === "dashboard" ? "page" : undefined}
              className={`rounded px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${current === "dashboard" ? "bg-accent text-on-accent" : "text-fg-muted hover:bg-surface-2"}`}
            >
              Dashboard
            </Link>
          ) : null}
        </nav>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded border border-border px-2.5 py-1.5 text-xs font-medium text-fg-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
