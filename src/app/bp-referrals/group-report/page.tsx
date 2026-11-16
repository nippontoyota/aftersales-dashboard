import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BpShell } from "@/components/bp-shell";
import { adminIdentityLabel } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import { REGIONS, type RegionName } from "@/lib/regions";
import { control, eyebrow } from "@/lib/ui";
import {
  buildPivot,
  buildRoi,
  buildSummary,
  inclusiveDateRange,
  loadGroupReportRows,
  resolveGroupReportRange,
} from "@/lib/bp-referrals/group-report";
import { GroupReportTabs } from "../group-report-tabs";

/** Month-range picker (2026-11-14, at the user's request — replaces the old
 * raw from/to date inputs, which defaulted to the whole year). Each
 * dropdown's own option values ARE the date the form needs (first-of-month
 * for "From", last-of-month for "To"), so submitting the form still just
 * produces plain ?from=&to= query params — no change needed anywhere else
 * on this page or in the Excel export route. Picking the same month twice
 * views one month (the default); picking Jan + Dec of the same year covers
 * that whole year, same as the "Whole year" links below but one click. */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function monthStart(ym: string): string {
  return `${ym}-01`;
}

function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 0); // day 0 of next month = last day of this month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Trailing `count` months up to and including the current one, oldest
 * first. The currently-selected month is injected too if it falls outside
 * this window (e.g. an old bookmarked link), same defensive pattern as the
 * BPHO analytics view's own month picker. */
function monthOptions(count: number, selected: string): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  if (!months.includes(selected)) months.push(selected);
  return months.sort();
}

export default async function GroupReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (
    admin.role !== "bp_ho" &&
    admin.role !== "hq" &&
    admin.role !== "regional" &&
    admin.role !== "bp_manager" &&
    admin.role !== "branch"
  ) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const { from, to } = resolveGroupReportRange(params.from, params.to);
  // BP manager/branch (2026-11-16, at the user's request): own branch only,
  // same scoping mechanism a regional admin's own region already uses
  // below. BpShell below for bp_manager (matching their main /bp-referrals
  // queue page's own bare shell), AppShell for branch (matching theirs).
  const branches = admin.role === "regional" ? [...REGIONS[admin.region]] : admin.role === "bp_manager" || admin.role === "branch" ? [admin.branch] : undefined;
  const navState = admin.role === "bp_manager" ? null : await loadNavState(admin);

  const rows = await loadGroupReportRows(inclusiveDateRange(from, to), branches);
  const pivot = buildPivot(rows);
  const summary = buildSummary(rows);
  const roi = buildRoi(summary);
  const regionOrder = Object.keys(REGIONS) as RegionName[];

  const downloadHref = `/api/bp-referrals/group-report?from=${from}&to=${to}`;

  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const fromOpts = monthOptions(24, fromMonth);
  const toOpts = monthOptions(24, toMonth);
  const currentYear = Number(new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }));
  const yearLinks = [currentYear, currentYear - 1, currentYear - 2];

  const content = (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <a href="/bp-referrals" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg hover:underline">
          ← Back to BP Referrals
        </a>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-fg">Group Report</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Group Accident Vehicle Referral report — {rows.length} referral{rows.length === 1 ? "" : "s"}, {from} to {to}.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <form method="get" className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <span className={eyebrow}>From</span>
                <select name="from" defaultValue={monthStart(fromMonth)} className={`${control} px-2`}>
                  {fromOpts.map((m) => (
                    <option key={m} value={monthStart(m)}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className={eyebrow}>To</span>
                <select name="to" defaultValue={monthEnd(toMonth)} className={`${control} px-2`}>
                  {toOpts.map((m) => (
                    <option key={m} value={monthEnd(m)}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="h-8 rounded-md bg-accent px-3 text-xs font-semibold text-on-accent hover:bg-accent-hover">
                Apply
              </button>
              <a href={downloadHref} className="h-8 rounded-md border border-border-strong px-3 text-xs font-semibold leading-8 text-fg hover:bg-surface-2">
                Download Excel
              </a>
            </form>
            <p className="text-[11px] text-fg-faint">
              Whole year:{" "}
              {yearLinks.map((y, i) => (
                <span key={y}>
                  {i > 0 ? " · " : ""}
                  <a href={`?from=${y}-01-01&to=${y}-12-31`} className="text-accent hover:underline">
                    {y}
                  </a>
                </span>
              ))}
            </p>
          </div>
        </div>

        <GroupReportTabs pivot={pivot} summary={summary} roi={roi} rows={rows} regionOrder={regionOrder} />
      </div>
  );

  if (admin.role === "bp_manager") {
    return <BpShell identity={adminIdentityLabel(admin)}>{content}</BpShell>;
  }

  return (
    <AppShell
      current="bp-referrals"
      showDashboardLink={true}
      isHq={admin.role === "hq"}
      isBpHo={admin.role === "bp_ho"}
      isRegional={admin.role === "regional"}
      isBranch={admin.role === "branch"}
      centralNav={admin.role === "regional" && admin.region === "Central"}
      regionalRmNav={admin.role === "regional" && admin.region !== "Central"}
      companyTabs={navState!.companyTabs}
      canUpload={navState!.canUpload}
      slimNav={admin.role === "regional" || admin.role === "branch" ? navState!.slimNav : undefined}
      dashboardLabel={navState!.dashboardLabel}
      queriesBadge={navState!.queriesBadge}
      identity={adminIdentityLabel(admin)}
    >
      {content}
    </AppShell>
  );
}
