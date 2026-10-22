import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { adminIdentityLabel } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import { ensureAssignedBranches, loadAllReferrals, loadQueueForBranch } from "@/lib/inactive-referrals/store";
import { ReferralsQueueClient } from "./referrals-queue-client";

export default async function ReferralsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "branch" && admin.role !== "hq") redirect("/dashboard");

  await ensureAssignedBranches();
  const [nav, queue] = await Promise.all([
    loadNavState(admin),
    admin.role === "branch" ? loadQueueForBranch(admin.branch) : loadAllReferrals(),
  ]);

  return (
    <AppShell
      current="referrals"
      showDashboardLink={admin.canViewDashboard}
      isHq={admin.role === "hq"}
      companyTabs={nav.companyTabs}
      canUpload={nav.canUpload}
      slimNav={nav.slimNav}
      isBranch={admin.role === "branch"}
      queriesBadge={nav.queriesBadge}
      dashboardLabel={nav.dashboardLabel}
      identity={adminIdentityLabel(admin)}
    >
      <div className="mx-auto w-full max-w-[1000px] p-6">
        <ReferralsQueueClient queue={queue} readOnly={admin.role === "hq"} showBranch={admin.role === "hq"} />
      </div>
    </AppShell>
  );
}
