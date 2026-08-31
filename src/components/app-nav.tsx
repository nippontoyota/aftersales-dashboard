import Link from "next/link";
import { logoutAction } from "@/lib/actions";

export function AppNav({ current, showDashboardLink }: { current: "upload" | "dashboard"; showDashboardLink: boolean }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-slate-900">Nippon Toyota — Admin Portal</span>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/upload"
            aria-current={current === "upload" ? "page" : undefined}
            className={`rounded px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 ${current === "upload" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Upload
          </Link>
          {showDashboardLink ? (
            <Link
              href="/dashboard"
              aria-current={current === "dashboard" ? "page" : undefined}
              className={`rounded px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 ${current === "dashboard" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              Dashboard
            </Link>
          ) : null}
        </nav>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
