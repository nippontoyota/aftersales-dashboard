import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { adminIdentityLabel } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import { reportingDate, invalidReportDateReason } from "@/lib/reporting-date";
import { loadReportHolidaySet } from "@/lib/report-holidays/store";
import { ReportDatePicker } from "./report-date-picker";
import { loadServiceInfoSnapshot } from "@/lib/service-info/store";
import { loadPartSaleSnapshot } from "@/lib/part-sale/store";
import { loadSsrv089Snapshot } from "@/lib/ssrv089/store";
import { loadScom205Snapshot } from "@/lib/scom205/store";
import { loadRawReportUpload } from "@/lib/raw-report-uploads/store";
import { isBodyPaintOnly } from "@/lib/report";
import { BaToolUploadForm } from "./ba-tool-upload-form";
import { BillUploadForm } from "./bill-upload-form";
import { CancellationUploadForm } from "./cancellation-upload-form";
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
  // Regional managers and the VP are read-only — no upload surface at all.
  if (admin?.role === "vp_service") redirect("/vp");
  if (admin?.role === "regional") redirect("/dashboard");
  const identity = admin ? adminIdentityLabel(admin) : "";
  const nav = admin ? await loadNavState(admin) : { companyTabs: true, dashboardLabel: "Executive Overview", canUpload: true, slimNav: false };

  // The date picker defaults to the computed report date — one date for every
  // branch each round (see src/lib/reporting-date.ts) — but a branch can pick
  // an earlier day to catch up. It can't pick a Saturday or an HQ-flagged
  // holiday: those would split one upload round across two dates. The `?date=`
  // is re-validated here so a hand-typed URL can't get past the picker.
  const isBranch = admin?.role === "branch";
  const holidaySet = isBranch ? await loadReportHolidaySet() : new Set<string>();
  const canonicalDate = isBranch ? reportingDate(holidaySet) : "";
  const params = await searchParams;
  const requested = params.date ?? "";
  const requestedOk =
    isBranch &&
    /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
    requested <= new Date().toISOString().slice(0, 10) &&
    !invalidReportDateReason(requested, holidaySet);
  const reportDate = requestedOk ? requested : canonicalDate;
  // Body & Paint-only branches have no general-service desk, so their DMS
  // never produces the GS-variant Service Info / Cost & Sales files — don't
  // offer those two forms (and pending-uploads.ts drops them too).
  const bpOnly = admin?.role === "branch" && isBodyPaintOnly(admin.branch);
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
    <AppShell current="upload" showDashboardLink={admin?.canViewDashboard ?? false} isHq={admin?.role === "hq"} companyTabs={nav.companyTabs} slimNav={nav.slimNav} dashboardLabel={nav.dashboardLabel} identity={identity}>
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
              <>
                <h1 className="text-xl font-semibold tracking-tight text-fg">Upload branch reports</h1>
                <p className="mt-1 text-sm text-fg-subtle">
                  Uploading as <span className="font-medium text-fg-muted">{admin.branch}</span>. Figures are attributed
                  to your branch automatically. Once a report is uploaded for a date, that section locks — ask HQ
                  (Upload Sheet) for a correction.
                </p>
                <div className="mt-4 rounded-lg border border-border bg-surface p-4 shadow-card">
                  <label htmlFor="report-date" className="block text-xs font-medium text-fg-muted">
                    Report date
                  </label>
                  <div className="mt-1">
                    <ReportDatePicker selected={reportDate} holidays={[...holidaySet]} />
                  </div>
                  <p className="mt-1.5 text-xs text-fg-subtle">
                    Defaults to{" "}
                    {new Date(`${canonicalDate}T00:00:00Z`).toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      timeZone: "UTC",
                    })}{" "}
                    — the same date for every branch this round. Pick an earlier day to catch one up; Saturdays and
                    holidays can&apos;t be picked (their data reaches us folded into the following Sunday).
                    {reportDate !== canonicalDate ? (
                      <>
                        {" "}
                        <span className="font-medium text-fg-muted">Filing for {reportDate}.</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="mt-4 space-y-4">
                  {!bpOnly && (
                    <ServiceInfoUploadForm reportDate={reportDate} alreadyUploaded={alreadyUploaded?.serviceInfo} />
                  )}
                  <ServiceInfoBpUploadForm reportDate={reportDate} alreadyUploaded={alreadyUploaded?.serviceInfoBp} />
                  {!bpOnly && (
                    <Ssrv089GeneralUploadForm reportDate={reportDate} alreadyUploaded={alreadyUploaded?.ssrvGeneral} />
                  )}
                  <Ssrv089BpUploadForm reportDate={reportDate} alreadyUploaded={alreadyUploaded?.ssrvBp} />
                  <PartSaleUploadForm reportDate={reportDate} alreadyUploaded={alreadyUploaded?.partSale} />
                  <Scom205UploadForm reportDate={reportDate} alreadyUploaded={alreadyUploaded?.scom205} />
                </div>
              </>
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
