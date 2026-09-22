import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel } from "@/lib/admin-store";
import { loadAccountsData, type AccountsRegionRollup } from "@/lib/accounts-data";
import { achievementRatio } from "@/lib/aggregate";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import { requireAccountsAccess } from "./accounts-guard";
import { AccountsHeader } from "./accounts-header";
import { DraftWarning } from "@/components/draft-warning";

const REGION_COLOR: Record<AccountsRegionRollup["region"], string> = {
  Central: "var(--color-cat-central)",
  South: "var(--color-cat-south)",
  North: "var(--color-cat-north)",
};

export default async function AccountsOverviewPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const admin = await requireAccountsAccess();
  return (
    <AppShell current="accounts" showDashboardLink accountsNav identity={adminIdentityLabel(admin)}>
      <Suspense fallback={<DashboardPageSkeleton heroCards={4} />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Overview({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const data = await loadAccountsData(params.date);

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <AccountsHeader eyebrow="Nippon Group · Accounts" title="Executive Overview" />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
      </div>
    );
  }
  if (!data.report || !data.group) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <AccountsHeader eyebrow="Nippon Group · Accounts" title="Executive Overview" dates={data.dates} date={data.date} basePath="/accounts" />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool report on file for {data.date}.
        </div>
      </div>
    );
  }

  const { group, regions } = data;
  const uploadedAtLabel = new Date(data.report.uploadedAt).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  const gusMtd = (group.hero.gusPartsMtd ?? 0) + (group.hero.gusLabourMtd ?? 0);
  const bpuMtd = (group.hero.bpuPartsMtd ?? 0) + (group.hero.bpuLabourMtd ?? 0);
  const scrapOilMtd = (group.hero.scrapRevenueMtd ?? 0) + (group.hero.usedOilRevenueMtd ?? 0);

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      {!data.isPublished && (
        <DraftWarning uploadedBranches={data.uploadedBranchCount} totalBranches={data.totalBranchCount} />
      )}
      <AccountsHeader
        eyebrow="Nippon Group · Accounts"
        title="Executive Overview"
        subtitle="Company-wide revenue breakdown, month-to-date."
        dates={data.dates}
        date={data.date}
        basePath="/accounts"
        asOfLabel={uploadedAtLabel}
      />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Total Revenue · MTD" value={formatCompactCurrency(group.hero.totalRevenueStreamMtd)} accent />
        <Tile label="GUS Parts + Labour · MTD" value={formatCompactCurrency(gusMtd)} />
        <Tile label="BPU Parts + Labour · MTD" value={formatCompactCurrency(bpuMtd)} />
        <Tile label="External Sales · MTD" value={formatCompactCurrency(group.hero.externalSalesMtd)} />
        <Tile
          label="VAS Bill · MTD"
          value={formatCompactCurrency(group.kpis.vasAchievementForTheMonth)}
          sub={`${formatPercent(achievementRatio(group.kpis.vasAchievementForTheMonth, group.kpis.vasBillTarget))} of target`}
        />
        <Tile label="Scrap + Used Oil · MTD" value={formatCompactCurrency(scrapOilMtd)} />
        <Tile
          label="Cancellations · This Month"
          value={formatCompactCurrency(group.cancellations.beforeTaxTotal)}
          sub={`${group.cancellations.count} invoice${group.cancellations.count === 1 ? "" : "s"} · before tax · not netted from revenue above`}
          warn
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {regions.map((r) => (
          <RegionCard key={r.region} region={r} date={data.date} />
        ))}
      </div>

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-fg-faint">
        Total Revenue = GUS + BPU parts &amp; labour + External Sales + scrap/used oil (same figure CEO/VP see). Cancellations
        is a separate, gross figure — invoice_cancellations is control/audit data only, not wired into any revenue total.
      </p>
    </div>
  );
}

function Tile({ label, value, sub, accent, warn }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-card ${
        accent ? "border-accent/30 bg-accent-soft/40" : warn ? "border-warn/30 bg-warn-soft/30" : "border-border bg-surface"
      }`}
    >
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-faint">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${warn ? "text-warn" : "text-fg"}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-fg-subtle">{sub}</div> : null}
    </div>
  );
}

function RegionCard({ region, date }: { region: AccountsRegionRollup; date: string }) {
  return (
    <Link
      href={`/accounts/branches?date=${date}&region=${region.region}`}
      className="block rounded-xl border border-border bg-surface p-4 shadow-card transition hover:border-accent/40 hover:bg-surface-2/40"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-fg">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: REGION_COLOR[region.region] }} />
          {region.region}
        </span>
        <span className="text-[11px] text-fg-faint">{region.branches.length} branches</span>
      </div>
      <div className="mt-3 text-lg font-semibold tabular-nums text-fg">{formatCompactCurrency(region.hero.totalRevenueStreamMtd)}</div>
      <div className="mt-1 text-[11px] text-fg-subtle">
        Cancellations: {formatCompactCurrency(region.cancellations.beforeTaxTotal)} ({region.cancellations.count})
      </div>
    </Link>
  );
}
