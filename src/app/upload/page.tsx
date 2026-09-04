import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { adminIdentityLabel } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import { yesterdayIso } from "@/lib/utils";
import { loadServiceInfoSnapshot } from "@/lib/service-info/store";
import { loadPartSaleSnapshot } from "@/lib/part-sale/store";
import { loadSsrv089Snapshot } from "@/lib/ssrv089/store";
import { loadScom205Snapshot } from "@/lib/scom205/store";
import { loadRawReportUpload } from "@/lib/raw-report-uploads/store";
import { BaToolUploadForm } from "./ba-tool-upload-form";
import { ReportDatePicker } from "./report-date-picker";
import { BillUploadForm } from "./bill-upload-form";
import { PartSaleUploadForm } from "./part-sale-upload-form";
import { Scom205UploadForm } from "./scom205-upload-form";
import { ServiceInfoUploadForm } from "./service-info-upload-form";
import { ServiceInfoBpUploadForm } from "./service-info-bp-upload-form";
import { Ssrv089GeneralUploadForm } from "./ssrv089-general-upload-form";
import { Ssrv089BpUploadForm } from "./ssrv089-bp-upload-form";
import { UploadTabs } from "./upload-tabs";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const admin = await getCurrentAdmin();
  // Regional managers are read-only — no upload surface at all.
  if (admin?.role === "regional") redirect("/dashboard");
  const identity = admin ? adminIdentityLabel(admin) : "";
  const nav = admin ? await loadNavState(admin) : { companyTabs: true, dashboardLabel: "Dashboard", canUpload: true };

  // Branches upload today for yesterday's report, so the date picker (and
  // this lock-status check) default to yesterdayIso(). A branch catching up
  // a day they missed picks that earlier date at the top of the panel — it
  // flows through ?date= to here, so both the lock status of every section
  // and the date each upload is filed under follow the picker. The regex
  // guard keeps a junk param from reaching the snapshot loads.
  const params = await searchParams;
  const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : yesterdayIso();
  const alreadyUploaded =
    admin?.role === "branch"
      ? await (async () => {
          // Service Info - BP and Cost and Sales - BP joined the required
          // set 2026-09-01, at the user's request — six report types per
          // branch per day now, nothing parsed out of the two BP ones (see
          // raw-report-uploads/store.ts).
          const [serviceInfo, serviceInfoBp, ssrvGeneral, ssrvBp, partSale, scom205] = await Promise.all([
            loadServiceInfoSnapshot(reportDate, admin.branch),
            loadRawReportUpload(reportDate, admin.branch, "service_info_bp"),
            loadSsrv089Snapshot(reportDate, admin.branch, "general"),
            loadRawReportUpload(reportDate, admin.branch, "ssrv089_bp"),
            loadPartSaleSnapshot(reportDate, admin.branch),
            loadScom205Snapshot(reportDate, admin.branch),
          ]);
          const pick = (s: { sourceFileName: string; uploadedAt: string } | null) =>
            s ? { sourceFileName: s.sourceFileName, uploadedAt: s.uploadedAt } : null;
          return {
            serviceInfo: pick(serviceInfo),
            serviceInfoBp: pick(serviceInfoBp),
            ssrvGeneral: pick(ssrvGeneral),
            ssrvBp: pick(ssrvBp),
            partSale: pick(partSale),
            scom205: pick(scom205),
          };
        })()
      : null;

  return (
    <AppShell current="upload" showDashboardLink={admin?.canViewDashboard ?? false} isHq={admin?.role === "hq"} companyTabs={nav.companyTabs} dashboardLabel={nav.dashboardLabel} identity={identity}>
      <div className="mx-auto w-full max-w-2xl p-6">
        {admin?.role === "hq" ? (
          <UploadTabs
            dailyReports={
              <>
                <h1 className="text-lg font-semibold text-fg">Upload BA Tool Report</h1>
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
                <h1 className="text-lg font-semibold text-fg">Upload Bills</h1>
                <p className="mt-1 text-sm text-fg-subtle">
                  Upload PDF tax invoices. The total taxable value and invoice number will be extracted automatically.
                </p>
                <div className="mt-4">
                  <BillUploadForm />
                </div>
              </>
            }
          />
        ) : admin?.role === "branch" ? (
          <UploadTabs
            dailyReports={
              <>
                <h1 className="text-lg font-semibold text-fg">Upload branch reports</h1>
                <p className="mt-1 text-sm text-fg-subtle">
                  Uploading as <span className="font-medium text-fg-muted">{admin.branch}</span>. Figures are attributed
                  to your branch automatically. Once a report is uploaded for a date, that section locks — ask HQ
                  (Upload Sheet) for a correction.
                </p>
                <div className="mt-4 rounded-md border border-border bg-surface p-4">
                  <label htmlFor="report-date" className="block text-xs font-medium text-fg-muted">
                    Report date
                  </label>
                  <div className="mt-1">
                    <ReportDatePicker selected={reportDate} />
                  </div>
                  <p className="mt-1.5 text-xs text-fg-subtle">
                    Defaults to yesterday. Change it to upload a day you missed — each section below then shows for that
                    date.
                  </p>
                </div>
                <div className="mt-4 space-y-4">
                  <ServiceInfoUploadForm reportDate={reportDate} alreadyUploaded={alreadyUploaded?.serviceInfo} />
                  <ServiceInfoBpUploadForm reportDate={reportDate} alreadyUploaded={alreadyUploaded?.serviceInfoBp} />
                  <Ssrv089GeneralUploadForm reportDate={reportDate} alreadyUploaded={alreadyUploaded?.ssrvGeneral} />
                  <Ssrv089BpUploadForm reportDate={reportDate} alreadyUploaded={alreadyUploaded?.ssrvBp} />
                  <PartSaleUploadForm reportDate={reportDate} alreadyUploaded={alreadyUploaded?.partSale} />
                  <Scom205UploadForm reportDate={reportDate} alreadyUploaded={alreadyUploaded?.scom205} />
                </div>
              </>
            }
            bills={
              <>
                <h1 className="text-lg font-semibold text-fg">Upload Bills</h1>
                <p className="mt-1 text-sm text-fg-subtle">
                  Uploading as <span className="font-medium text-fg-muted">{admin.branch}</span>. Upload PDF tax
                  invoices — the total taxable value and invoice number will be extracted automatically.
                </p>
                <div className="mt-4">
                  <BillUploadForm />
                </div>
              </>
            }
          />
        ) : (
          <div className="mt-4 rounded border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
            Could not determine your account&apos;s role — contact an administrator.
          </div>
        )}
      </div>
    </AppShell>
  );
}
