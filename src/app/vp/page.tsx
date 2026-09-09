import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { achievementRatio, achievementTone } from "@/lib/aggregate";
import { adminIdentityLabel } from "@/lib/admin-store";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import { loadVpData } from "@/lib/vp-data";
import { FlagComposer } from "./flag-composer";
import { requireVpAccess } from "./vp-guard";
import { VpHeader } from "./vp-header";
import { VpScoreboard } from "./vp-scoreboard";

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

  const { group } = data;
  const flagBase = `/vp?date=${data.date}`;
  const uploadedAtLabel = new Date(data.report.uploadedAt).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  const vasRatio = achievementRatio(group.kpis.vasAchievementForTheMonth, group.kpis.vasBillTarget);

  const cards: { label: string; value: string; accent?: boolean; sub?: string; tone?: ReturnType<typeof achievementTone> }[] = [
    { label: "Total Revenue · MTD", value: formatCompactCurrency(group.hero.totalRevenueStreamMtd), accent: true },
    {
      label: "GUS RO · MTD",
      value: group.hero.gusRoMtd?.toLocaleString("en-IN") ?? "—",
      sub: `${group.hero.gusRoBilledForTheDay?.toLocaleString("en-IN") ?? "—"} today`,
    },
    {
      label: "BPU RO · MTD",
      value: group.hero.bpuRoMtd?.toLocaleString("en-IN") ?? "—",
      sub: `${group.hero.bpuRoBilledForTheDay?.toLocaleString("en-IN") ?? "—"} today`,
    },
    { label: "VAS Achievement", value: formatPercent(vasRatio), tone: achievementTone(vasRatio) },
  ];

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
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

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-xl border p-4 shadow-card ${c.accent ? "border-accent/30 bg-accent-soft/40" : "border-border bg-surface"}`}
          >
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-faint">{c.label}</div>
            <div
              className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${
                c.tone === "critical" ? "text-bad" : c.tone === "warn" ? "text-warn" : c.tone === "good" ? "text-good" : "text-fg"
              }`}
            >
              {c.value}
            </div>
            {c.sub ? <div className="mt-0.5 text-[11px] text-fg-subtle">{c.sub}</div> : null}
          </div>
        ))}
      </div>

      <div className="mt-6">
        <VpScoreboard data={data} flagBase={flagBase} />
      </div>

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-fg-faint">
        VAS bill is the modelled figure — T-Gloss / Lexus jobs priced at the master list, the same number shown across the
        dashboard. Total Revenue = GUS + BPU parts &amp; labour + External Sales + scrap / used oil.
      </p>

      <FlagComposer page="overview" date={data.date} />
    </div>
  );
}
