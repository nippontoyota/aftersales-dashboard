import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BpShell } from "@/components/bp-shell";
import { adminIdentityLabel, listBranchCodes } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import { REGIONS } from "@/lib/regions";
import { buildReport } from "@/lib/report";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";
import { latestNonHolidayDate, sundayOffWorkingDaysElapsedInMonth, sundayOffWorkingDaysInMonth } from "@/lib/reporting-date";
import { listSnapshotDates } from "@/lib/snapshot-store";
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
  // (BpmQueueClient's readOnly prop) and inside the normal AppShell instead
  // of BpShell, since "branch" accounts use the regular sidebar/nav
  // everywhere else.
  if (admin.role === "bp_manager" || admin.role === "branch") {
    await ensureAssignedBranches();
    const region = regionalLeadFor(admin.branch);
    const [queue, branchCodes, regionRollup, transferredOut, allDates, holidays] = await Promise.all([
      loadQueueForBranch(admin.branch),
      listBranchCodes(),
      region ? loadRegionRollup(region) : Promise.resolve(null),
      loadTransferredOutFromBranch(admin.branch),
      listSnapshotDates(),
      loadReportHolidaySet(),
    ]);
    // BPU target vs. actual for this branch alone (2026-11-12, at the user's
    // request — BPMs only ever saw referral-program numbers here, never
    // their own branch's BPU progress; 2026-11-14, swapped from the bay-
    // utilization BP RO target to the same fixed-month-end BPU metric shown
    // on the branch dashboard's Targets — MTD panel). Reuses the latest
    // uploaded, non-holiday date — same "what date to show" rule as the
    // CEO/branch dashboards (reporting-date.ts's latestNonHolidayDate) —
    // rather than wiring in this page's own date picker, which nothing else
    // here needs.
    const reportDate = latestNonHolidayDate(allDates, holidays);
    const report = reportDate ? await buildReport(reportDate) : null;
    const branchReport = report?.branches.find((b) => b.branch === admin.branch) ?? null;
    const workingDaysElapsed = reportDate ? sundayOffWorkingDaysElapsedInMonth(reportDate, holidays) : 0;
    const workingDaysTotal = reportDate ? sundayOffWorkingDaysInMonth(reportDate, holidays) : 0;
    const elapsedFraction = workingDaysTotal > 0 ? workingDaysElapsed / workingDaysTotal : null;
    const bpuMtd = branchReport?.bpuAchievementForTheMonth ?? null;
    const bpuTarget = branchReport?.bpuTarget ?? null;
    const bpuRatio = bpuMtd !== null && bpuTarget !== null && bpuTarget !== 0 ? bpuMtd / bpuTarget : null;
    const bpuProgress = {
      mtd: bpuMtd,
      target: bpuTarget,
      ratio: bpuRatio,
      paceRatio: bpuRatio === null || elapsedFraction === null || elapsedFraction === 0 ? null : bpuRatio / elapsedFraction,
    };
    const queueClient = (
      <BpmQueueClient
        ownBranch={admin.branch}
        queue={queue}
        branchCodes={branchCodes}
        regionName={region}
        regionRollup={regionRollup}
        transferredOut={transferredOut}
        bpuProgress={bpuProgress}
        readOnly={admin.role === "branch"}
      />
    );

    if (admin.role === "branch") {
      const navState = await loadNavState(admin);
      return (
        <AppShell
          current="bp-referrals"
          showDashboardLink={true}
          isBranch={true}
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

    return <BpShell identity={adminIdentityLabel(admin)}>{queueClient}</BpShell>;
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
