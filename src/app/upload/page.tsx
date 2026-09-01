import { AppShell } from "@/components/app-shell";
import { getCurrentAdmin } from "@/lib/auth";
import { yesterdayIso } from "@/lib/utils";
import { loadServiceInfoSnapshot } from "@/lib/service-info/store";
import { loadPartSaleSnapshot } from "@/lib/part-sale/store";
import { loadSsrv089Snapshot } from "@/lib/ssrv089/store";
import { loadScom205Snapshot } from "@/lib/scom205/store";
import { BaToolUploadForm } from "./ba-tool-upload-form";
import { PartSaleUploadForm } from "./part-sale-upload-form";
import { Scom205UploadForm } from "./scom205-upload-form";
import { ServiceInfoUploadForm } from "./service-info-upload-form";
import { Ssrv089GeneralUploadForm } from "./ssrv089-general-upload-form";

export default async function UploadPage() {
  const admin = await getCurrentAdmin();
  const identity = admin?.role === "hq" ? "HQ admin" : admin?.role === "branch" ? `${admin.branch} branch` : "";

  // Branches upload today for yesterday's report, and every upload form's
  // date picker defaults to yesterdayIso() to match — so the lock-status
  // check here has to look at the same date, or it would check "today"
  // (almost never actually uploaded under) and the lock would never show.
  const reportDate = yesterdayIso();
  const alreadyUploaded =
    admin?.role === "branch"
      ? await (async () => {
          // Body & Paint dropped from branch uploads entirely (2026-08-31,
          // at the user's request — never fed any dashboard formula). Only
          // these 4 report types are required per branch per day now.
          const [serviceInfo, partSale, ssrvGeneral, scom205] = await Promise.all([
            loadServiceInfoSnapshot(reportDate, admin.branch),
            loadPartSaleSnapshot(reportDate, admin.branch),
            loadSsrv089Snapshot(reportDate, admin.branch, "general"),
            loadScom205Snapshot(reportDate, admin.branch),
          ]);
          const pick = (s: { sourceFileName: string; uploadedAt: string } | null) =>
            s ? { sourceFileName: s.sourceFileName, uploadedAt: s.uploadedAt } : null;
          return {
            serviceInfo: pick(serviceInfo),
            partSale: pick(partSale),
            ssrvGeneral: pick(ssrvGeneral),
            scom205: pick(scom205),
          };
        })()
      : null;

  return (
    <AppShell current="upload" showDashboardLink={admin?.canViewDashboard ?? false} isHq={admin?.role === "hq"} identity={identity}>
      <div className="mx-auto w-full max-w-2xl p-6">
        {admin?.role === "hq" ? (
          <>
            <h1 className="text-lg font-semibold text-slate-900">Upload BA Tool Report</h1>
            <p className="mt-1 text-sm text-slate-500">
              Upload the daily BA Tool export. Choose the date this upload represents — it&apos;s used to compute
              day-over-day figures against the previous upload.
            </p>
            <div className="mt-4">
              <BaToolUploadForm />
            </div>
          </>
        ) : admin?.role === "branch" ? (
          <>
            <h1 className="text-lg font-semibold text-slate-900">Upload branch reports</h1>
            <p className="mt-1 text-sm text-slate-500">
              Uploading as <span className="font-medium text-slate-700">{admin.branch}</span>. Choose the date each
              upload represents — figures are attributed to your branch automatically. Once a report is uploaded for
              a date, that section locks — ask HQ (Upload Sheet) for a correction.
            </p>
            <div className="mt-4 space-y-4">
              <ServiceInfoUploadForm alreadyUploaded={alreadyUploaded?.serviceInfo} />
              <Ssrv089GeneralUploadForm alreadyUploaded={alreadyUploaded?.ssrvGeneral} />
              <PartSaleUploadForm alreadyUploaded={alreadyUploaded?.partSale} />
              <Scom205UploadForm alreadyUploaded={alreadyUploaded?.scom205} />
            </div>
          </>
        ) : (
          <div className="mt-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Could not determine your account&apos;s role — contact an administrator.
          </div>
        )}
      </div>
    </AppShell>
  );
}
