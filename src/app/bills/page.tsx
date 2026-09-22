import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { adminIdentityLabel } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import { loadBillTotalsByMonth } from "@/lib/bill/store";
import { BillsPageClient } from "./bills-page-client";

/** Bills page — visible to branch admins (own branch), HQ, and HQ viewer.
 * Branch admins see only their own bills; HQ sees all branches (no filter,
 * consistent with the existing dashboard drilldown). VP, CEO, and Accounts
 * are sent to their own executive views; regional managers are redirected to
 * /dashboard (they don't manage bills). */
export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role === "vp_service") redirect("/vp");
  if (admin.role === "ceo") redirect("/ceo");
  if (admin.role === "accounts") redirect("/accounts");
  if (admin.role === "regional") redirect("/dashboard");

  const nav = await loadNavState(admin);
  const identity = adminIdentityLabel(admin);

  // Branch admins see only their own bills; everyone else sees all.
  const scopeBranch = admin.role === "branch" ? admin.branch : undefined;

  const params = await searchParams;
  const allMonths = await loadBillTotalsByMonth(scopeBranch);

  // Validate ?month= param
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month) && allMonths.some((m) => m.month === params.month)
      ? params.month
      : allMonths[0]?.month;

  return (
    <AppShell
      current="bills"
      showDashboardLink={admin.canViewDashboard}
      isHq={admin.role === "hq"}
      companyTabs={nav.companyTabs}
      canUpload={nav.canUpload}
      slimNav={nav.slimNav}
      isRegional={false}
      queriesBadge={nav.queriesBadge}
      dashboardLabel={nav.dashboardLabel}
      identity={identity}
    >
      <div className="mx-auto w-full max-w-[1100px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fg">Bills</h1>
            <p className="mt-1 text-[13px] text-fg-subtle">
              {scopeBranch
                ? `Scrap and used-oil tax invoices uploaded for ${scopeBranch}.`
                : "Scrap and used-oil tax invoices across all branches."}
            </p>
          </div>
        </div>

        {allMonths.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
            No bills have been uploaded yet.{" "}
            {admin.role !== "hq" && admin.role !== "hq_viewer"
              ? "Upload PDF invoices from the Upload page."
              : ""}
          </div>
        ) : (
          <BillsPageClient months={allMonths} initialMonth={month} />
        )}
      </div>
    </AppShell>
  );
}
