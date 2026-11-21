import { listAccessoriesStaffNamesForBranch } from "../accessories-staff-store";
import { tierForBranch } from "../branch-tier";
import { buildReport, type BranchReport } from "../report";
import { loadRawUploadRowsForRange } from "../raw-upload-rows/store";
import { computeModelWiseBranch, sumModelWiseBranches, type ModelWiseBranchResult } from "./compute";

export type ModelWiseReport = {
  /** The date MTD is computed through — same meaning as report.ts's Report.date. */
  date: string;
  branches: ModelWiseBranchResult[];
  /** Sum across exactly the branches in `branches` above — the whole
   * company when `branchCodes` is omitted, or just the requested scope
   * (one region, one branch) when it's passed — see `branchCodes` below. */
  company: Omit<ModelWiseBranchResult, "branch">;
};

/** Loads and computes the Model-wise report, month-to-date through `date` —
 * same "YYYY-MM, up to and including date" convention report.ts's own MTD
 * snapshots use (see ssrv089/store.ts's loadAllSsrv089SnapshotsForMonthUpTo).
 * Reconciles each branch's GUS/BPU Parts & Labour brand split against that
 * SAME branch/date's already-computed report.ts figures (gusPartsMtd/
 * gusLabourMtd/bpuPartsMtd/bpuLabourMtd) — the one source of truth the rest
 * of the dashboard already shows — so this view's headline totals always
 * match it exactly; see compute.ts's scaleToOfficialTotal for why that's
 * needed (raw SSRV089 sums don't tie 1:1 on their own) and how the
 * per-brand split survives it.
 *
 * `branchCodes` restricts which branches are actually loaded/computed — a
 * branch or regional admin only ever needs their own scope, and this
 * computation is heavy enough per branch (full month of Service Info/
 * SSRV089/Part Sale rows) that computing all 17 just to show one would be
 * wasteful. Omit it for the full company. */
export async function loadModelWiseReport(date: string, branchCodes?: string[]): Promise<ModelWiseReport | null> {
  const report = await buildReport(date);
  if (!report) return null;

  const monthPrefix = date.slice(0, 7);
  const fromDate = `${monthPrefix}-01`;

  const scopedBranchReports = branchCodes ? report.branches.filter((b) => branchCodes.includes(b.branch)) : report.branches;

  const branches = await Promise.all(scopedBranchReports.map((branchReport) => loadOneBranch(branchReport, fromDate, date)));

  return {
    date,
    branches,
    company: sumModelWiseBranches(branches),
  };
}

async function loadOneBranch(branchReport: BranchReport, fromDate: string, toDate: string): Promise<ModelWiseBranchResult> {
  const branch = branchReport.branch;

  const [serviceInfoRows, serviceInfoBpRows, ssrv089Rows, ssrv089BpRows, partSaleRows, accessoriesStaffNames] = await Promise.all([
    loadRawUploadRowsForRange("service_info", branch, fromDate, toDate) as Promise<Record<string, unknown>[]>,
    loadRawUploadRowsForRange("service_info_bp", branch, fromDate, toDate) as Promise<Record<string, unknown>[]>,
    loadRawUploadRowsForRange("ssrv089", branch, fromDate, toDate) as Promise<Record<string, unknown>[]>,
    loadRawUploadRowsForRange("ssrv089_bp", branch, fromDate, toDate) as Promise<Record<string, unknown>[]>,
    loadRawUploadRowsForRange("part_sale", branch, fromDate, toDate) as Promise<Record<string, unknown>[]>,
    listAccessoriesStaffNamesForBranch(branch),
  ]);

  return computeModelWiseBranch({
    branch,
    serviceInfoRows,
    serviceInfoBpRows,
    ssrv089Rows,
    ssrv089BpRows,
    partSaleRows,
    tier: tierForBranch(branch),
    accessoriesStaffNames,
    officialGus: { parts: branchReport.gusPartsMtd, labour: branchReport.gusLabourMtd },
    officialBp: { parts: branchReport.bpuPartsMtd, labour: branchReport.bpuLabourMtd },
    officialTgloss: branchReport.vasAchievementForTheMonth,
  });
}
