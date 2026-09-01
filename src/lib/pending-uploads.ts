import { listBranchCodes } from "./admin-store";
import { loadAllServiceInfoSnapshotsForDate } from "./service-info/store";
import { loadAllPartSaleSnapshotsForDate } from "./part-sale/store";
import { loadAllSsrv089SnapshotsForDate } from "./ssrv089/store";
import { loadAllScom205SnapshotsForDate } from "./scom205/store";
import { loadAllRawReportUploadsForDate } from "./raw-report-uploads/store";

/** The 6 report types every branch uploads daily, in the same order they
 * appear on /upload — used here so "what's missing" reads in that order
 * too, not an arbitrary one. */
export type ReportTypeKey = "serviceInfoGs" | "serviceInfoBp" | "ssrv089Gs" | "ssrv089Bp" | "partSale" | "scom205";

export const REPORT_TYPE_LABELS: Record<ReportTypeKey, string> = {
  serviceInfoGs: "Service Information Report - GS",
  serviceInfoBp: "Service Information Report - BP",
  ssrv089Gs: "Cost and Sales Report - GS",
  ssrv089Bp: "Cost and Sales Report - BP",
  partSale: "Part Sale Report",
  scom205: "KPI",
};

export const REPORT_TYPE_ORDER: ReportTypeKey[] = ["serviceInfoGs", "serviceInfoBp", "ssrv089Gs", "ssrv089Bp", "partSale", "scom205"];

export type BranchUploadStatus = {
  branch: string;
  missing: ReportTypeKey[];
};

export type PendingUploadsSummary = {
  date: string;
  totalBranches: number;
  completeCount: number;
  /** Only branches missing at least one report type — worst-first isn't
   * meaningful here (nothing to rank by severity, just presence/absence),
   * so this is just branch-code order. */
  pending: BranchUploadStatus[];
};

/** Cross-references every branch against all 6 report types for one date,
 * in 6 bulk queries total (not 20x6 = 120) — same "one query per report
 * type, not per branch" pattern the dashboard's own report-building
 * already uses. HQ checks this each morning to see who still needs
 * chasing (2026-09-01, at the user's request). */
export async function loadPendingUploadsSummary(date: string): Promise<PendingUploadsSummary> {
  const [branches, serviceInfo, serviceInfoBp, ssrv089, ssrv089Bp, partSale, scom205] = await Promise.all([
    listBranchCodes(),
    loadAllServiceInfoSnapshotsForDate(date),
    loadAllRawReportUploadsForDate(date, "service_info_bp"),
    loadAllSsrv089SnapshotsForDate(date, "general"),
    loadAllRawReportUploadsForDate(date, "ssrv089_bp"),
    loadAllPartSaleSnapshotsForDate(date),
    loadAllScom205SnapshotsForDate(date),
  ]);

  const done: Record<ReportTypeKey, Set<string>> = {
    serviceInfoGs: new Set(serviceInfo.map((r) => r.branch)),
    serviceInfoBp: new Set(serviceInfoBp.map((r) => r.branch)),
    ssrv089Gs: new Set(ssrv089.map((r) => r.branch)),
    ssrv089Bp: new Set(ssrv089Bp.map((r) => r.branch)),
    partSale: new Set(partSale.map((r) => r.branch)),
    scom205: new Set(scom205.map((r) => r.branch)),
  };

  const pending: BranchUploadStatus[] = [];
  for (const branch of [...branches].sort()) {
    const missing = REPORT_TYPE_ORDER.filter((type) => !done[type].has(branch));
    if (missing.length > 0) pending.push({ branch, missing });
  }

  return {
    date,
    totalBranches: branches.length,
    completeCount: branches.length - pending.length,
    pending,
  };
}
