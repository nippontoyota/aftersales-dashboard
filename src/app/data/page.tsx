import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentAdmin } from "@/lib/auth";
import { listAllAccessoriesStaff } from "@/lib/accessories-staff-store";
import { addAccessoriesStaffAction, removeAccessoriesStaffAction } from "@/lib/accessories-staff-actions";
import { listReportHolidays, loadReportHolidaySet } from "@/lib/report-holidays/store";
import { addReportHolidayAction, removeReportHolidayAction } from "@/lib/report-holidays/actions";
import { reportingDate } from "@/lib/reporting-date";
import { REGIONS, type RegionName } from "@/lib/regions";

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function DataPage() {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") {
    redirect("/upload");
  }

  const [allStaff, holidays, holidaySet] = await Promise.all([
    listAllAccessoriesStaff(),
    listReportHolidays(),
    loadReportHolidaySet(),
  ]);
  const currentReportDate = reportingDate(holidaySet);

  const staffByBranch = new Map<string, { id: number; name: string }[]>();
  for (const s of allStaff) {
    const list = staffByBranch.get(s.branch) ?? [];
    list.push({ id: s.id, name: s.name });
    staffByBranch.set(s.branch, list);
  }

  return (
    <AppShell current="data" showDashboardLink={admin.canViewDashboard} isHq identity="HQ admin">
      <div className="mx-auto w-full max-w-3xl p-6">
        <h1 className="text-xl font-semibold tracking-tight text-fg">Report Holidays</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          Flag a date as a non-working day. The branch upload date defaults to <strong>one</strong> computed date for
          everyone — the most recent day that isn&apos;t a Saturday (its data reaches us Monday, filed under the Sunday)
          or a holiday flagged here — and a branch can&apos;t pick a Saturday or a holiday even when catching up an
          earlier day.
        </p>

        <div className="mt-4 rounded-lg border border-border bg-surface p-4 shadow-card">
          <div className="text-sm text-fg-muted">
            Branches are uploading for <span className="font-semibold text-fg">{longDate(currentReportDate)}</span> right now.
          </div>

          <form action={addReportHolidayAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-dashed border-border pt-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-fg-muted">Holiday date</span>
              <input
                type="date"
                name="date"
                required
                className="h-8 rounded-md border border-border-strong px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-fg-muted">Note (optional)</span>
              <input
                type="text"
                name="note"
                placeholder="e.g. Onam, local bandh"
                className="h-8 min-w-0 rounded-md border border-border-strong px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>
            <button
              type="submit"
              className="h-8 shrink-0 rounded-md bg-accent px-2.5 text-xs font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Add holiday
            </button>
          </form>

          {holidays.length > 0 ? (
            <ul className="mt-3 space-y-1 border-t border-dashed border-border pt-3">
              {holidays.map((h) => (
                <li key={h.date} className="flex items-center justify-between gap-2 text-sm text-fg-muted">
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-fg">{longDate(h.date)}</span>
                    {h.note ? ` — ${h.note}` : ""}
                  </span>
                  <form action={removeReportHolidayAction}>
                    <input type="hidden" name="date" value={h.date} />
                    <button
                      type="submit"
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-fg-faint hover:bg-bad-soft hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      title={`Remove the ${h.date} holiday`}
                    >
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 border-t border-dashed border-border pt-3 text-xs text-fg-faint">No holidays flagged.</div>
          )}
        </div>

        <h1 className="mt-10 text-xl font-semibold tracking-tight text-fg">Accessories Staff</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          Who counts as Accessories-department staff, per branch — used to identify Accessories sales in each branch&apos;s
          SSRV089 report (matched against &quot;Close SA Name&quot;, see the GUS Parts/Labour MTD formula). Add or remove a
          name here whenever staff changes — no code change needed.
        </p>

        <div className="mt-6 space-y-6">
          {(Object.keys(REGIONS) as RegionName[]).map((region) => (
            <div key={region}>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-faint">{region}</h2>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {REGIONS[region].map((branch) => {
                  const staff = staffByBranch.get(branch) ?? [];
                  return (
                    <div key={branch} className="rounded-lg border border-border bg-surface p-3.5 shadow-card">
                      <div className="text-sm font-semibold text-fg">{branch}</div>

                      {staff.length === 0 ? (
                        <div className="mt-2 text-xs text-fg-faint">No staff listed — contributes nothing yet.</div>
                      ) : (
                        <ul className="mt-2 space-y-1">
                          {staff.map((s) => (
                            <li key={s.id} className="flex items-center justify-between gap-2 text-sm text-fg-muted">
                              <span className="min-w-0 truncate">{s.name}</span>
                              <form action={removeAccessoriesStaffAction}>
                                <input type="hidden" name="id" value={s.id} />
                                <button
                                  type="submit"
                                  className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-fg-faint hover:bg-bad-soft hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                  title={`Remove ${s.name} from ${branch}`}
                                >
                                  Remove
                                </button>
                              </form>
                            </li>
                          ))}
                        </ul>
                      )}

                      <form action={addAccessoriesStaffAction} className="mt-3 flex items-center gap-1.5 border-t border-dashed border-border pt-3">
                        <input type="hidden" name="branch" value={branch} />
                        <input
                          type="text"
                          name="name"
                          placeholder="Add a name"
                          required
                          className="h-8 min-w-0 flex-1 rounded-md border border-border-strong px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        />
                        <button
                          type="submit"
                          className="h-8 shrink-0 rounded-md bg-accent px-2.5 text-xs font-medium text-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
