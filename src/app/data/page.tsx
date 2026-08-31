import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentAdmin } from "@/lib/auth";
import { listAllAccessoriesStaff } from "@/lib/accessories-staff-store";
import { addAccessoriesStaffAction, removeAccessoriesStaffAction } from "@/lib/accessories-staff-actions";
import { REGIONS, type RegionName } from "@/lib/regions";

export default async function DataPage() {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") {
    redirect("/upload");
  }

  const allStaff = await listAllAccessoriesStaff();
  const staffByBranch = new Map<string, { id: number; name: string }[]>();
  for (const s of allStaff) {
    const list = staffByBranch.get(s.branch) ?? [];
    list.push({ id: s.id, name: s.name });
    staffByBranch.set(s.branch, list);
  }

  return (
    <AppShell current="data" showDashboardLink={admin.canViewDashboard} isHq identity="HQ admin">
      <div className="mx-auto w-full max-w-3xl p-6">
        <h1 className="text-lg font-semibold text-slate-900">Accessories Staff</h1>
        <p className="mt-1 text-sm text-slate-500">
          Who counts as Accessories-department staff, per branch — used to identify Accessories sales in each branch&apos;s
          SSRV089 report (matched against &quot;Close SA Name&quot;, see the GUS Parts/Labour MTD formula). Add or remove a
          name here whenever staff changes — no code change needed.
        </p>

        <div className="mt-6 space-y-6">
          {(Object.keys(REGIONS) as RegionName[]).map((region) => (
            <div key={region}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{region}</h2>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {REGIONS[region].map((branch) => {
                  const staff = staffByBranch.get(branch) ?? [];
                  return (
                    <div key={branch} className="rounded-md border border-slate-200 bg-white p-3.5">
                      <div className="text-sm font-semibold text-slate-900">{branch}</div>

                      {staff.length === 0 ? (
                        <div className="mt-2 text-xs text-slate-400">No staff listed — contributes nothing yet.</div>
                      ) : (
                        <ul className="mt-2 space-y-1">
                          {staff.map((s) => (
                            <li key={s.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                              <span className="min-w-0 truncate">{s.name}</span>
                              <form action={removeAccessoriesStaffAction}>
                                <input type="hidden" name="id" value={s.id} />
                                <button
                                  type="submit"
                                  className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                                  title={`Remove ${s.name} from ${branch}`}
                                >
                                  Remove
                                </button>
                              </form>
                            </li>
                          ))}
                        </ul>
                      )}

                      <form action={addAccessoriesStaffAction} className="mt-3 flex items-center gap-1.5 border-t border-dashed border-slate-200 pt-3">
                        <input type="hidden" name="branch" value={branch} />
                        <input
                          type="text"
                          name="name"
                          placeholder="Add a name"
                          required
                          className="h-8 min-w-0 flex-1 rounded border border-slate-300 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                        />
                        <button
                          type="submit"
                          className="h-8 shrink-0 rounded bg-slate-900 px-2.5 text-xs font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                        >
                          Add
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
