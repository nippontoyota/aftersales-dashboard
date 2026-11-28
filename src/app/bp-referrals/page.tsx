import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { adminIdentityLabel, listBranchCodes } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import { REGIONS } from "@/lib/regions";
import {
  currentMonthKey,
  ensureAssignedBranches,
  loadAllReferrals,
  loadBranchRollup,
  loadPayoutHistory,
  loadPayoutLedger,
  loadQueueForBranch,
  loadRegionRollup,
  loadTransferredOutFromBranch,
  monthToRange,
  regionalLeadFor,
} from "@/lib/bp-referrals/store";
import { BpHoAnalyticsClient } from "./bp-ho-analytics-client";
import { BpmQueueClient } from "./bpm-queue-client";

export default async function BpReferralsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");

  // Which month the BP HO/HQ/regional analytics view below is scoped to
  // (2026-11-09, the user's request — that view used to show all-time
  // totals with no way to narrow it). "all" keeps the old all-time
  // behaviour; anything else defaults to the current month. Needs-attention
  // (overdue/dropped) and the Payout ledger/history stay unscoped regardless
  // — see loadAllReferrals' two calls below and loadPayoutLedger's doc
  // comment.
  const { month: monthParam } = await searchParams;
  const month = monthParam === "all" || /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam ?? "") ? monthParam! : currentMonthKey();
  const range = month === "all" ? undefined : monthToRange(month);

  // A plain branch account's own read-only view of this same page
  // (2026-11-16, at the user's request) — same data, same component as a
  // BPM's own queue below, just with every action control hidden
  // (BpmQueueClient's readOnly prop). Both now share the normal AppShell
  // (2026-11-28, at the user's request — a BPM used to get the bare BpShell
  // with no sidebar; now they get the same full nav as a branch account,
  // including their own branch's dashboard/performance view, with BP
  // Referrals still their default landing page via the root-page redirect).
  if (admin.role === "bp_manager" || admin.role === "branch") {
    await ensureAssignedBranches();
    const region = regionalLeadFor(admin.branch);
    const [queue, branchCodes, regionRollup, transferredOut, navState] = await Promise.all([
      loadQueueForBranch(admin.branch),
      listBranchCodes(),
      region ? loadRegionRollup(region) : Promise.resolve(null),
      loadTransferredOutFromBranch(admin.branch),
      loadNavState(admin),
    ]);
    const queueClient = (
      <BpmQueueClient
        ownBranch={admin.branch}
        queue={queue}
        branchCodes={branchCodes}
        regionName={region}
        regionRollup={regionRollup}
        transferredOut={transferredOut}
        readOnly={admin.role === "branch"}
      />
    );

    return (
      <AppShell
        current="bp-referrals"
        showDashboardLink={true}
        isBranch={true}
        isBpManager={admin.role === "bp_manager"}
        companyTabs={navState.companyTabs}
        canUpload={navState.canUpload}
        slimNav={navState.slimNav}
        dashboardLabel={navState.dashboardLabel}
        queriesBadge={navState.queriesBadge}
        cancellationsBadge={navState.cancellationsBadge}
        identity={adminIdentityLabel(admin)}
      >
        {queueClient}
      </AppShell>
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
    const [referrals, liveReferrals, payoutLedger, branchRollup, navState] = await Promise.all([
      loadRegionRollup(admin.region, range),
      loadRegionRollup(admin.region),
      loadPayoutLedger(branches),
      loadBranchRollup(branches, range),
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
        cancellationsBadge={navState.cancellationsBadge}
        identity={adminIdentityLabel(admin)}
      >
        <BpHoAnalyticsClient
          referrals={referrals}
          liveReferrals={liveReferrals}
          payoutLedger={payoutLedger}
          branchRollup={branchRollup}
          branchCodes={branches}
          canRescan={false}
          month={month}
        />
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
    const [referrals, liveReferrals, payoutLedger, payoutHistory, branchRollup, branchCodes, navState] = await Promise.all([
      loadAllReferrals(range),
      loadAllReferrals(),
      loadPayoutLedger(),
      loadPayoutHistory(),
      loadBranchRollup(undefined, range),
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
        cancellationsBadge={navState.cancellationsBadge}
        identity={adminIdentityLabel(admin)}
      >
        <BpHoAnalyticsClient
          referrals={referrals}
          liveReferrals={liveReferrals}
          payoutLedger={payoutLedger}
          payoutHistory={payoutHistory}
          branchRollup={branchRollup}
          branchCodes={branchCodes}
          month={month}
        />
      </AppShell>
    );
  }

  redirect("/dashboard");
}
