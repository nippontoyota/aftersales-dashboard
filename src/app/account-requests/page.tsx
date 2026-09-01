import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentAdmin } from "@/lib/auth";
import { listDecidedSignupRequests, listPendingSignupRequests } from "@/lib/signup-store";
import { approveSignupRequestAction, rejectSignupRequestAction } from "@/lib/signup-actions";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

/** HQ-only — approve or reject self-service branch-admin signup requests
 * (see /signup and signup-store.ts). Approving is the only thing that
 * creates a real `admins` row; this page is the entire gate the user asked
 * for ("HQ has to approve so that many people can't simply create accounts
 * and login", 2026-09-01). */
export default async function AccountRequestsPage() {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") redirect("/upload");

  const [pending, decided] = await Promise.all([listPendingSignupRequests(), listDecidedSignupRequests()]);

  return (
    <AppShell current="account-requests" showDashboardLink={admin.canViewDashboard} isHq identity="HQ admin">
      <div className="mx-auto w-full max-w-2xl p-6">
        <h1 className="text-lg font-semibold text-slate-900">Account Requests</h1>
        <p className="mt-1 text-sm text-slate-500">
          Branch users request their own login at /signup — nothing works until you approve it here.
        </p>

        <div className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Pending <span className="font-normal normal-case text-slate-300">({pending.length})</span>
          </h2>
          {pending.length === 0 ? (
            <div className="mt-2 rounded border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-400">Nothing pending.</div>
          ) : (
            <ul className="mt-2 space-y-2">
              {pending.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">
                      {r.name} <span className="font-normal text-slate-400">— {r.username}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.branch} · requested {formatWhen(r.requestedAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <form action={approveSignupRequestAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="h-8 rounded bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                      >
                        Approve
                      </button>
                    </form>
                    <form action={rejectSignupRequestAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="h-8 rounded border border-slate-300 px-3 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                      >
                        Reject
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {decided.length > 0 ? (
          <div className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recently decided</h2>
            <ul className="mt-2 space-y-1.5">
              {decided.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-white px-3.5 py-2 text-xs">
                  <div className="min-w-0 text-slate-600">
                    <span className="font-medium text-slate-800">{r.name}</span> — {r.username} ({r.branch})
                  </div>
                  <div className="shrink-0 text-slate-400">
                    <span className={r.status === "approved" ? "font-medium text-emerald-600" : "font-medium text-red-500"}>
                      {r.status === "approved" ? "Approved" : "Rejected"}
                    </span>
                    {r.decidedAt ? ` · ${formatWhen(r.decidedAt)}` : ""}
                    {r.decidedBy ? ` by ${r.decidedBy}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
