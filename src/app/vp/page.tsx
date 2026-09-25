import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel } from "@/lib/admin-store";
import { loadVpData } from "@/lib/vp-data";
import { FlagComposer } from "./flag-composer";
import { requireVpAccess } from "./vp-guard";
import { RevenueStreamGrid } from "./revenue-stream-grid";
import { VpHeader } from "./vp-header";
import { DraftWarning } from "@/components/draft-warning";

export default async function VpOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; flag?: string; fmetric?: string; fvalue?: string }>;
}) {
  const admin = await requireVpAccess();

  return (
    <AppShell current="vp" showDashboardLink vpNav identity={adminIdentityLabel(admin)}>
      <Suspense fallback={<DashboardPageSkeleton heroCards={4} />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Overview({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; flag?: string; fmetric?: string; fvalue?: string }>;
}) {
  const params = await searchParams;
  const data = await loadVpData(params.date);

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <VpHeader eyebrow="Nippon Group · Service" title="Executive Overview" flagHref="/vp?flag=1" />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
      </div>
    );
  }
  if (!data.report || !data.group) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <VpHeader eyebrow="Nippon Group · Service" title="Executive Overview" dates={data.dates} date={data.date} basePath="/vp" flagHref={`/vp?date=${data.date}&flag=1`} />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool report on file for {data.date}.
        </div>
      </div>
    );
  }

  const flagBase = `/vp?date=${data.date}`;
  const uploadedAtLabel = new Date(data.report.uploadedAt).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      {!data.isPublished && (
        <DraftWarning uploadedBranches={data.uploadedBranchCount} totalBranches={data.totalBranchCount} />
      )}
      <VpHeader
        eyebrow="Nippon Group · Service"
        title="Executive Overview"
        subtitle="Company-wide Service daily report, month-to-date."
        dates={data.dates}
        date={data.date}
        basePath="/vp"
        flagHref={`${flagBase}&flag=1`}
        showPrint
        asOfLabel={uploadedAtLabel}
      />

      <div className="mt-8">
        <RevenueStreamGrid scopes={data.scopes} date={data.date} />
      </div>

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-fg-faint">
        Total Revenue Stream = GUS + BPU parts &amp; labour + External Sales + scrap / used oil. Incentive slab progress is
        graded against Total Revenue Stream, using each scope&apos;s combined Slab 1–4 targets.
      </p>

      <FlagComposer page="overview" date={data.date} />
    </div>
  );
}
