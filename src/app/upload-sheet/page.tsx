import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentAdmin } from "@/lib/auth";
import { loadPendingUploadsSummary } from "@/lib/pending-uploads";
import { yesterdayIso } from "@/lib/utils";
import { PendingUploadsPanel } from "./pending-uploads-panel";
import { UploadSheetForm } from "./upload-sheet-form";
import { UploadSheetDatePicker } from "./upload-sheet-date-picker";

export default async function UploadSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "hq") {
    redirect("/upload");
  }

  const params = await searchParams;
  // Use the requested date, defaulting to yesterday if none provided.
  const targetDate = params.date ?? yesterdayIso();

  const summary = await loadPendingUploadsSummary(targetDate);

  return (
    <AppShell current="upload-sheet" showDashboardLink={admin.canViewDashboard} isHq identity="HQ admin">
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Upload Sheet</h1>
            <p className="mt-1 text-sm text-slate-500">
              A fallback for uploading a branch&apos;s report on their behalf — e.g. someone&apos;s on leave, or there&apos;s an
              issue on their side.
            </p>
          </div>
          <div className="flex-shrink-0">
            <UploadSheetDatePicker selected={targetDate} />
          </div>
        </div>

        <PendingUploadsPanel summary={summary} />

        <UploadSheetForm />
      </div>
    </AppShell>
  );
}
