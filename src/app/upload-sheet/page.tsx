import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentAdmin } from "@/lib/auth";
import { loadPendingUploadsSummary } from "@/lib/pending-uploads";
import { yesterdayIso } from "@/lib/utils";
import { PendingUploadsPanel } from "./pending-uploads-panel";
import { UploadSheetForm } from "./upload-sheet-form";

export default async function UploadSheetPage() {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") {
    redirect("/upload");
  }

  // Same date every branch's own upload forms default to — this is
  // literally "who hasn't finished today's expected upload yet."
  const summary = await loadPendingUploadsSummary(yesterdayIso());

  return (
    <AppShell current="upload-sheet" showDashboardLink={admin.canViewDashboard} isHq identity="HQ admin">
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Upload Sheet</h1>
          <p className="mt-1 text-sm text-slate-500">
            A fallback for uploading a branch&apos;s report on their behalf — e.g. someone&apos;s on leave, or there&apos;s an
            issue on their side.
          </p>
        </div>

        <PendingUploadsPanel summary={summary} />

        <UploadSheetForm />
      </div>
    </AppShell>
  );
}
