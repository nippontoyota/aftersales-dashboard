import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageHeader } from "@/components/dashboard-page-header";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel, type AdminAccount } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadDashboardData, loadNavState } from "@/lib/dashboard-data";
import { NoDataForDate } from "@/components/no-data-for-date";
import { REGIONS, type RegionName } from "@/lib/regions";
import { listRegionQueries, listRegionQueriesForRegion } from "@/lib/region-queries/store";
import { CancellationFlag } from "../cancellations/cancellation-flag";
import { VpFlagsPanel } from "@/components/vp-flags-panel";
import { RaiseToHqForm, RaiseToRegionForm } from "./region-query-forms";
import { RegionQueryThread } from "./region-query-thread";

/** Formerly "Alerts" — the achievement-below-target list (AlertsPanel) was
 * dropped entirely (2026-09-15, at the user's request: "not really needed").
 * HQ keeps VP Service's flag inbox (VpFlagsPanel) plus the Cancellations
 * flag, and now also the HQ↔Regional query threads (RegionQueriesSection).
 * A regional admin gets their own scoped view of that same feature
 * (2026-09-16) — everyone else is sent to /dashboard. */
export default async function QueriesPage({ searchParams }: { searchParams: Promise<{ date?: string; region?: string }> }) {
  const admin = await getCurrentAdmin();
  if (admin?.role === "vp_service") redirect("/vp");
  if (admin?.role === "ceo") redirect("/ceo");
  if (admin?.role === "accounts") redirect("/accounts");
  if (!admin?.canViewDashboard) redirect("/upload");
  if (admin.role !== "hq" && admin.role !== "regional") redirect("/dashboard");

  const nav = await loadNavState(admin);
  const identity = adminIdentityLabel(admin);

  return (
    <AppShell
      current="queries"
      showDashboardLink
      isHq={admin.role === "hq"}
      companyTabs={nav.companyTabs}
      canUpload={nav.canUpload}
      isRegional={admin.role === "regional"}
      queriesBadge={nav.queriesBadge}
      identity={identity}
    >
      {admin.role === "regional" ? (
        <RegionalQueriesContent admin={admin} />
      ) : (
        <Suspense fallback={<DashboardPageSkeleton />}>
          <HqQueriesContent searchParams={searchParams} admin={admin} />
        </Suspense>
      )}
    </AppShell>
  );
}

async function HqQueriesContent({
  searchParams,
  admin,
}: {
  searchParams: Promise<{ date?: string; region?: string }>;
  admin: AdminAccount;
}) {
  const params = await searchParams;
  const data = await loadDashboardData(params, admin);

  if (!data) {
    return (
      <div className="mx-auto max-w-[1600px] p-6">
        <h1 className="text-lg font-semibold text-fg">Queries</h1>
        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
      </div>
    );
  }
  if (!data.report) {
    return <NoDataForDate title="Queries" date={data.date} dates={data.dates} basePath="/queries" />;
  }

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      <DashboardPageHeader
        title="Queries"
        basePath="/queries"
        date={data.date}
        region={data.region}
        dates={data.dates}
        branchCount={data.filteredBranches.length}
        hasPreviousUpload={data.hasPreviousUpload}
        previousDate={data.report?.previousDate ?? null}
        daysSincePrevious={data.report?.daysSincePrevious ?? null}
        isPublished={data.isPublished}
        canPublish={data.canPublish}
        isCompanyScope={data.isCompanyScope}
      />
      <Suspense fallback={null}>
        <CancellationFlag admin={admin} />
      </Suspense>
      <Suspense fallback={null}>
        <VpFlagsPanel admin={admin} />
      </Suspense>
      <Suspense fallback={null}>
        <RegionQueriesSection admin={admin} />
      </Suspense>
    </div>
  );
}

/** HQ's slice of the HQ↔Regional queries — every thread, with a composer to
 * start a new one addressed to a region. */
async function RegionQueriesSection({ admin }: { admin: AdminAccount }) {
  const queries = await listRegionQueries();
  const open = queries.filter((q) => q.status !== "closed");
  // CO01C (online store) has no admin/manager of its own — its questions belong to CO01A.
  const regions = (Object.keys(REGIONS) as RegionName[]).map((region) => ({
    region,
    branches: REGIONS[region].filter((b) => b !== "CO01C"),
  }));

  if (open.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-border-subtle bg-surface p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Regional Queries — none open</span>
          <RaiseToRegionForm regions={regions} />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-info/30 bg-info-soft/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-info">
          Regional Queries — {open.length} open
        </span>
        <RaiseToRegionForm regions={regions} />
      </div>
      <div className="mt-2 space-y-2">
        {open.map((q) => (
          <RegionQueryThread
            key={q.id}
            query={q}
            viewerCanReply={q.direction === "to_hq" && !q.reply}
            viewerCanManage={admin.role === "hq" || admin.username === q.createdBy}
          />
        ))}
      </div>
    </div>
  );
}

/** A regional manager's own Queries page — their region's threads (both
 * directions), plus a composer to ask HQ a new question. */
async function RegionalQueriesContent({ admin }: { admin: Extract<AdminAccount, { role: "regional" }> }) {
  const queries = await listRegionQueriesForRegion(admin.region);
  const open = queries.filter((q) => q.status !== "closed");
  const closed = queries.filter((q) => q.status === "closed");
  const branches = REGIONS[admin.region].filter((b) => b !== "CO01C");

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-text">{admin.region} · Queries</div>
            <h1 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-tight text-fg">Questions with HQ</h1>
            <p className="mt-1.5 max-w-xl text-[13px] text-fg-subtle">
              Questions you&apos;ve raised and HQ&apos;s replies, plus anything HQ has asked you.
            </p>
          </div>
          <RaiseToHqForm branches={branches} />
        </div>
      </header>

      {queries.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M4 4.5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-3.5 3v-3H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-3 text-sm text-fg-subtle">No queries yet — ask HQ a question above.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-3">
            {open.map((q) => (
              <RegionQueryThread
                key={q.id}
                query={q}
                viewerCanReply={q.direction === "to_region" && !q.reply}
                viewerCanManage={admin.username === q.createdBy}
              />
            ))}
          </div>
          {closed.length > 0 ? (
            <>
              <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">Resolved</h2>
              <div className="mt-3 space-y-3">
                {closed.map((q) => (
                  <RegionQueryThread key={q.id} query={q} viewerCanReply={false} viewerCanManage={admin.username === q.createdBy} />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
