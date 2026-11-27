import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { adminIdentityLabel } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import {
  ensureAssignedBranches,
  loadAllReferrals,
  loadBranchRollup,
  loadPayoutHistory,
  loadPayoutLedger,
  loadQueueForBranch,
} from "@/lib/inactive-referrals/store";
import { ReferralsQueueClient } from "./referrals-queue-client";
import { ReferralsHqDashboard } from "./referrals-hq-dashboard";

export default async function ReferralsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role !== "branch" && admin.role !== "hq") redirect("/dashboard");

  await ensureAssignedBranches();

  if (admin.role === "hq") {
    const [referrals, payoutLedger, payoutHistory, branchRollup, nav] = await Promise.all([
      loadAllReferrals(),
      loadPayoutLedger(),
      loadPayoutHistory(),
      loadBranchRollup(),
      loadNavState(admin),
    ]);
    return (
      <AppShell
        current="referrals"
        showDashboardLink={admin.canViewDashboard}
        isHq={true}
        companyTabs={nav.companyTabs}
        canUpload={nav.canUpload}
        slimNav={nav.slimNav}
        queriesBadge={nav.queriesBadge}
        cancellationsBadge={nav.cancellationsBadge}
        dashboardLabel={nav.dashboardLabel}
        identity={adminIdentityLabel(admin)}
      >
        <ReferralsHqDashboard referrals={referrals} payoutLedger={payoutLedger} payoutHistory={payoutHistory} branchRollup={branchRollup} />
      </AppShell>
    );
  }

  const [nav, queue] = await Promise.all([loadNavState(admin), loadQueueForBranch(admin.branch)]);

  return (
    <AppShell
      current="referrals"
      showDashboardLink={admin.canViewDashboard}
      isBranch={true}
      companyTabs={nav.companyTabs}
      canUpload={nav.canUpload}
      slimNav={nav.slimNav}
      queriesBadge={nav.queriesBadge}
      cancellationsBadge={nav.cancellationsBadge}
      dashboardLabel={nav.dashboardLabel}
      identity={adminIdentityLabel(admin)}
    >
      <div className="mx-auto w-full max-w-[1100px] p-6">
        <ReferralsQueueClient queue={queue} ownBranch={admin.branch} />
      </div>
    </AppShell>
  );
}
