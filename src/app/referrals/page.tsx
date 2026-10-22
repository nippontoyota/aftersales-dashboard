import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { adminIdentityLabel } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import { ensureAssignedBranches, loadQueueForBranch } from "@/lib/inactive-referrals/store";
import { ReferralsQueueClient } from "./referrals-queue-client";

export default async function ReferralsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "branch") redirect("/dashboard");

  await ensureAssignedBranches();
  const [nav, queue] = await Promise.all([loadNavState(admin), loadQueueForBranch(admin.branch)]);

  return (
    <AppShell
      current="referrals"
      showDashboardLink={admin.canViewDashboard}
      isHq={false}
      companyTabs={nav.companyTabs}
      canUpload={nav.canUpload}
      slimNav={nav.slimNav}
      isBranch={true}
      queriesBadge={nav.queriesBadge}
      dashboardLabel={nav.dashboardLabel}
      identity={adminIdentityLabel(admin)}
    >
      <div className="mx-auto w-full max-w-[1000px] p-6">
        <ReferralsQueueClient queue={queue} />
      </div>
    </AppShell>
  );
}
