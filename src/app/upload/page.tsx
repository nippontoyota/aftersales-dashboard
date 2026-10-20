import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { adminIdentityLabel } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import { reportingDate } from "@/lib/reporting-date";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";
import { loadServiceInfoSnapshot } from "@/lib/service-info/store";
import { loadPartSaleSnapshot } from "@/lib/part-sale/store";
import { loadSsrv089Snapshot } from "@/lib/ssrv089/store";
import { loadScom205Snapshot } from "@/lib/scom205/store";
import { loadRawReportUpload } from "@/lib/raw-report-uploads/store";
import { loadLabourSalesSnapshotForWindow } from "@/lib/labour-sales/store";
import { isBodyPaintOnly, onlineStoreCodeFor } from "@/lib/report";
import type { ReportTypeKey } from "@/lib/pending-uploads";
import { BaToolUploadForm } from "./ba-tool-upload-form";
import { BillUploadForm } from "./bill-upload-form";
import { CancellationUploadForm } from "./cancellation-upload-form";
import { BranchUploadStatus } from "./branch-upload-status";
import { UploadTabs } from "./upload-tabs";

export default async function UploadPage() {
  const admin = await getCurrentAdmin();
  // Regional managers, VP, CEO, Accounts, and HQ viewer are read-only — no upload surface at all.
  if (admin?.role === "vp_service") redirect("/vp");
  if (admin?.role === "ceo") redirect("/ceo");
  if (admin?.role === "accounts") redirect("/accounts");
  if (admin?.role === "hq_viewer") redirect("/dashboard");
  if (admin?.role === "regional") redirect("/dashboard");
  if (admin?.role === "bp_manager" || admin?.role === "bp_ho") redirect("/bp-referrals");
  const identity = admin ? adminIdentityLabel(admin) : "";
  const nav = admin
    ? await loadNavState(admin)
    : { companyTabs: true, dashboardLabel: "Executive Overview", canUpload: true, slimNav: false, queriesBadge: 0 };

  // Branches no longer upload these themselves (CTDMS automation does it
  // end to end now, see d88ca68) — just show what's arrived for today's
  // computed report date so a branch can confirm the automation ran.
  const isBranch = admin?.role === "branch";
  const holidaySet = isBranch ? await loadReportHolidaySet() : new Set<string>();
  const reportDate = isBranch ? reportingDate(holidaySet) : "";
  const bpOnly = isBranch && admin ? isBodyPaintOnly(admin.branch) : false;
  const onlineStoreCode = isBranch && admin ? onlineStoreCodeFor(admin.branch) : undefined;
  const uploadStatus =
    isBranch && admin
      ? await (async () => {
          const [serviceInfo, serviceInfoBp, ssrvGeneral, ssrvBp, partSale, scom205, labourSales, partSaleOnline] = await Promise.all([
            bpOnly ? Promise.resolve(null) : loadServiceInfoSnapshot(reportDate, admin.branch),
            loadRawReportUpload(reportDate, admin.branch, "service_info_bp"),
            bpOnly ? Promise.resolve(null) : loadSsrv089Snapshot(reportDate, admin.branch, "general"),
            loadRawReportUpload(reportDate, admin.branch, "ssrv089_bp"),
            loadPartSaleSnapshot(reportDate, admin.branch),
            loadScom205Snapshot(reportDate, admin.branch),
            loadLabourSalesSnapshotForWindow(reportDate, admin.branch),
            onlineStoreCode ? loadPartSaleSnapshot(reportDate, onlineStoreCode) : Promise.resolve(null),
          ]);
          const pick = (s: { sourceFileName: string; uploadedAt: string } | null) =>
            s ? { sourceFileName: s.sourceFileName, uploadedAt: s.uploadedAt } : null;
          const statuses: { key: ReportTypeKey; info: { sourceFileName: string; uploadedAt: string } | null }[] = [
            ...(bpOnly ? [] : [{ key: "serviceInfoGs" as ReportTypeKey, info: pick(serviceInfo) }]),
            { key: "serviceInfoBp", info: pick(serviceInfoBp) },
            ...(bpOnly ? [] : [{ key: "ssrv089Gs" as ReportTypeKey, info: pick(ssrvGeneral) }]),
            { key: "ssrv089Bp", info: pick(ssrvBp) },
            { key: "partSale", info: pick(partSale) },
            { key: "scom205", info: pick(scom205) },
            { key: "labourSales", info: pick(labourSales) },
          ];
          return { statuses, partSaleOnline: pick(partSaleOnline) };
        })()
      : null;

  return (
    <AppShell current="upload" showDashboardLink={admin?.canViewDashboard ?? false} isHq={admin?.role === "hq"} companyTabs={nav.companyTabs} slimNav={nav.slimNav} isBranch={admin?.role === "branch"} queriesBadge={nav.queriesBadge} dashboardLabel={nav.dashboardLabel} identity={identity}>
      <div className="mx-auto w-full max-w-2xl p-6">
        {admin?.role === "hq" ? (
          <UploadTabs
            dailyReports={
              <>
                <h1 className="text-xl font-semibold tracking-tight text-fg">Upload BA Tool Report</h1>
                <p className="mt-1 text-sm text-fg-subtle">
                  Upload the daily BA Tool export. Choose the date this upload represents — it&apos;s used to compute
                  day-over-day figures against the previous upload.
                </p>
                <div className="mt-4">
                  <BaToolUploadForm />
                </div>
              </>
            }
            bills={
              <>
                <h1 className="text-xl font-semibold tracking-tight text-fg">Upload Bills</h1>
                <p className="mt-1 text-sm text-fg-subtle">
                  Upload PDF tax invoices. The total taxable value and invoice number will be extracted automatically.
                </p>
                <div className="mt-4">
                  <BillUploadForm />
                </div>
              </>
            }
            cancellations={
              <>
                <h1 className="text-xl font-semibold tracking-tight text-fg">Upload Cancellation Report</h1>
                <p className="mt-1 text-sm text-fg-subtle">
                  The DMS Tax Invoice Cancellation Report (PDF) — run it for a day, a range, or a whole month, one or more
                  branches. Rows merge by invoice number; nothing is removed. Feeds the reconciliation and data-quality
                  view at{" "}
                  <a href="/cancellations" className="text-accent-text underline">
                    Cancellations
                  </a>
                  — it never changes a revenue figure.
                </p>
                <div className="mt-4">
                  <CancellationUploadForm />
                </div>
              </>
            }
          />
        ) : admin?.role === "branch" ? (
          <UploadTabs
            dailyReports={
              uploadStatus ? (
                <BranchUploadStatus
                  reportDate={reportDate}
                  statuses={uploadStatus.statuses}
                  onlineStore={onlineStoreCode ? { code: onlineStoreCode, info: uploadStatus.partSaleOnline } : undefined}
                />
              ) : null
            }
            bills={
              <>
                <h1 className="text-xl font-semibold tracking-tight text-fg">Upload Bills</h1>
                <p className="mt-1 text-sm text-fg-subtle">
                  Uploading as <span className="font-medium text-fg-muted">{admin.branch}</span>. Upload PDF tax
                  invoices — the total taxable value and invoice number will be extracted automatically.
                </p>
                <div className="mt-4">
                  <BillUploadForm />
                </div>
              </>
            }
            cancellations={
              <>
                <h1 className="text-xl font-semibold tracking-tight text-fg">Upload Cancellation Report</h1>
                <p className="mt-1 text-sm text-fg-subtle">
                  Uploading as <span className="font-medium text-fg-muted">{admin.branch}</span>. Upload the DMS Tax Invoice
                  Cancellation Report (PDF) whenever a new cancellation comes in — see it at{" "}
                  <a href="/cancellations" className="text-accent-text underline">
                    Cancellations
                  </a>
                  . It never changes a revenue figure.
                </p>
                <div className="mt-4">
                  <CancellationUploadForm />
                </div>
              </>
            }
          />
        ) : (
          <div className="mt-4 rounded-lg border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
            Could not determine your account&apos;s role — contact an administrator.
          </div>
        )}
      </div>
    </AppShell>
  );
}
