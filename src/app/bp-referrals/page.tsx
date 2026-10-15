import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BpShell } from "@/components/bp-shell";
import { adminIdentityLabel, listBranchCodes } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import {
  ensureAssignedBranches,
  loadAllReferrals,
  loadBranchRollup,
  loadPayoutLedger,
  loadQueueForBranch,
  loadRegionRollup,
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
    const [queue, branchCodes, regionRollup] = await Promise.all([
      loadQueueForBranch(admin.branch),
      listBranchCodes(),
      region ? loadRegionRollup(region) : Promise.resolve(null),
    ]);
    return (
      <BpShell identity={adminIdentityLabel(admin)}>
        <BpmQueueClient ownBranch={admin.branch} queue={queue} branchCodes={branchCodes} regionName={region} regionRollup={regionRollup} />
      </BpShell>
    );
  }

  // Company-wide analytics — BP HO's own bare-shell dashboard, and HQ's
  // upgraded /bp-referrals nav item (same read-only view; no call workflow,
  // that stays BPM-only). Both need assigned_branch resolved first, same as
  // a BPM's own queue.
  if (admin.role === "bp_ho" || admin.role === "hq") {
    await ensureAssignedBranches();
    const [referrals, payoutLedger, branchRollup, branchCodes] = await Promise.all([
      loadAllReferrals(),
      loadPayoutLedger(),
      loadBranchRollup(),
      listBranchCodes(),
    ]);

    if (admin.role === "bp_ho") {
      return (
        <BpShell identity={adminIdentityLabel(admin)}>
          <BpHoAnalyticsClient referrals={referrals} payoutLedger={payoutLedger} branchRollup={branchRollup} branchCodes={branchCodes} />
        </BpShell>
      );
    }

    const navState = await loadNavState(admin);
    return (
      <AppShell
        current="bp-referrals"
        showDashboardLink={true}
        isHq={true}
        companyTabs={navState.companyTabs}
        queriesBadge={navState.queriesBadge}
        identity={adminIdentityLabel(admin)}
      >
        <BpHoAnalyticsClient referrals={referrals} payoutLedger={payoutLedger} branchRollup={branchRollup} branchCodes={branchCodes} />
      </AppShell>
    );
  }

  redirect("/dashboard");
}
