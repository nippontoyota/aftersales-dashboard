import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BpShell } from "@/components/bp-shell";
import { adminIdentityLabel, listBranchCodes } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import { REGIONS } from "@/lib/regions";
import {
  ensureAssignedBranches,
  loadAllReferrals,
  loadBranchRollup,
  loadPayoutLedger,
  loadQueueForBranch,
  loadRegionRollup,
  loadTransferredOutFromBranch,
  regionalLeadFor,
} from "@/lib/bp-referrals/store";
import { BpHoAnalyticsClient } from "./bp-ho-analytics-client";
import { BpmQueueClient } from "./bpm-queue-client";

export default async function BpReferralsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  if (admin.role === "bp_manager") {
    await ensureAssignedBranches();
    const region = regionalLeadFor(admin.branch);
    const [queue, branchCodes, regionRollup, transferredOut] = await Promise.all([
      loadQueueForBranch(admin.branch),
      listBranchCodes(),
      region ? loadRegionRollup(region) : Promise.resolve(null),
      loadTransferredOutFromBranch(admin.branch),
    ]);
    return (
      <BpShell identity={adminIdentityLabel(admin)}>
        <BpmQueueClient
          ownBranch={admin.branch}
          queue={queue}
          branchCodes={branchCodes}
          regionName={region}
          regionRollup={regionRollup}
          transferredOut={transferredOut}
        />
      </BpShell>
    );
  }

  // A regional manager's own scoped view (2026-10-29, the user's request) —
  // same BP HO analytics component, filtered to their own region's branches,
  // inside their usual AppShell (not BpShell, which is BP-specific chrome
  // for the BPM/BP HO roles only). Read-only, same as BP HO, minus the
  // company-wide "Re-check pending RO entries" admin action (canRescan).
  if (admin.role === "regional") {
    await ensureAssignedBranches();
    const branches = [...REGIONS[admin.region]];
    const [referrals, payoutLedger, branchRollup, navState] = await Promise.all([
      loadRegionRollup(admin.region),
      loadPayoutLedger(branches),
      loadBranchRollup(branches),
      loadNavState(admin),
    ]);
    return (
      <AppShell
        current="bp-referrals"
        showDashboardLink={true}
        isRegional={true}
        centralNav={admin.region === "Central"}
        regionalRmNav={admin.region !== "Central"}
        companyTabs={navState.companyTabs}
        canUpload={navState.canUpload}
        slimNav={navState.slimNav}
        dashboardLabel={navState.dashboardLabel}
        queriesBadge={navState.queriesBadge}
        identity={adminIdentityLabel(admin)}
      >
        <BpHoAnalyticsClient referrals={referrals} payoutLedger={payoutLedger} branchRollup={branchRollup} branchCodes={branches} canRescan={false} />
      </AppShell>
    );
  }

  // Company-wide analytics — HQ's upgraded /bp-referrals nav item, and (as
  // of 2026-10-29) BP HO's own account too: folded into the same AppShell
  // nav as the rest of the read-only HQ suite (Dashboard, TKM Targets,
  // Queries, Branch Performance, Reports, Cancellations — same scope as
  // hq_viewer, see loadNavState) instead of its own bare BpShell, so BP HO
  // no longer needs a separate admin account to check the main dashboard.
  // Both need assigned_branch resolved first, same as a BPM's own queue.
  if (admin.role === "bp_ho" || admin.role === "hq") {
    await ensureAssignedBranches();
    const [referrals, payoutLedger, branchRollup, branchCodes, navState] = await Promise.all([
      loadAllReferrals(),
      loadPayoutLedger(),
      loadBranchRollup(),
      listBranchCodes(),
      loadNavState(admin),
    ]);

    return (
      <AppShell
        current="bp-referrals"
        showDashboardLink={true}
        isHq={admin.role === "hq"}
        isBpHo={admin.role === "bp_ho"}
        companyTabs={navState.companyTabs}
        canUpload={navState.canUpload}
        queriesBadge={navState.queriesBadge}
        identity={adminIdentityLabel(admin)}
      >
        <BpHoAnalyticsClient referrals={referrals} payoutLedger={payoutLedger} branchRollup={branchRollup} branchCodes={branchCodes} />
      </AppShell>
    );
  }

  redirect("/dashboard");
}
