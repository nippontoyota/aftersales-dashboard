import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { achievementRatio } from "@/lib/aggregate";
import { adminIdentityLabel } from "@/lib/admin-store";
import { formatCompactCurrency } from "@/lib/format";
import { regionForBranch } from "@/lib/regions";
import { isBodyPaintOnly, type BranchReport } from "@/lib/report";
import { loadVpData } from "@/lib/vp-data";
import { rankValues } from "@/lib/gus-per-car-trend";
import { bandClassName, LABOUR_PER_RO_BANDS, PARTS_PER_RO_BANDS, RevenuePerVehicleTable } from "../../dashboard/revenue-per-vehicle-table";
import { FlagComposer } from "../flag-composer";
import { GusPerCarCell } from "../gus-per-car-cell";
import { KeralaMapCard, type BranchPin } from "../kerala-map";
import { requireVpAccess } from "../vp-guard";
import { VpHeader } from "../vp-header";

/** GUS Parts + GUS Labour ÷ GUS RO — the map's bubble-size metric (switched
 * 2026-09-25 from Total Revenue MTD at the VP's request). Same null
 * convention as sumBpuRevenue (vp-data.ts): null only when neither part
 * contributed a real figure, 0/summed otherwise. */
function gusRevenuePerCar(parts: number | null, labour: number | null, ro: number | null): number | null {
  if (parts === null && labour === null) return null;
  return achievementRatio((parts ?? 0) + (labour ?? 0), ro);
}

/** Ranks every branch with a real GUS Parts/Car or Labour/Car figure this
 * month, for the click-to-detail modal (gus-per-car-cell.tsx). Body &
 * Paint-only branches never have a GUS figure at all, so they're excluded
 * from the pool the same way they're excluded from this table's rows. */
function rankGusPerCar(branches: BranchReport[], value: (b: BranchReport) => number | null) {
  const rows = branches
    .map((b) => ({ branch: b.branch, value: value(b) }))
    .filter((r): r is { branch: string; value: number } => r.value !== null);
  return rankValues(rows);
}

export default async function VpRegionsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; flag?: string }>;
}) {
  const admin = await requireVpAccess();
  return (
    <AppShell current="vp-regions" showDashboardLink vpNav identity={adminIdentityLabel(admin)}>
      <Suspense fallback={<DashboardPageSkeleton />}>
        <Regions searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Regions({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; flag?: string }>;
}) {
  const params = await searchParams;
  const data = await loadVpData(params.date);
  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <VpHeader eyebrow="Nippon Group · Service" title="Regions" flagHref="/vp/regions?flag=1" />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
      </div>
    );
  }
  if (!data.report || !data.group) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <VpHeader
          eyebrow="Nippon Group · Service"
          title="Regions"
          dates={data.dates}
          date={data.date}
          basePath="/vp/regions"
          flagHref={`/vp/regions?date=${data.date}&flag=1`}
        />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool report on file for {data.date}.
        </div>
      </div>
    );
  }

  const pins: BranchPin[] = data.report.branches.flatMap((b) => {
    const region = regionForBranch(b.branch);
    if (!region) return [];
    const perCar = gusRevenuePerCar(b.gusPartsMtd, b.gusLabourMtd, b.gusRoMtd);
    return [{ branch: b.branch, region, value: perCar, display: formatCompactCurrency(perCar) }];
  });

  const regionSummaries = data.regions.map((r) => ({
    region: r.region,
    display: formatCompactCurrency(gusRevenuePerCar(r.hero.gusPartsMtd, r.hero.gusLabourMtd, r.hero.gusRoMtd)),
    branches: r.branches.length,
  }));

  const generalBranches = data.report.branches.filter((b) => !isBodyPaintOnly(b.branch));
  const partsRank = rankGusPerCar(generalBranches, (b) => (b.gusRoMtd === null || b.gusRoMtd === 0 ? null : achievementRatio(b.gusPartsMtd, b.gusRoMtd)));
  const labourRank = rankGusPerCar(generalBranches, (b) => (b.gusRoMtd === null || b.gusRoMtd === 0 ? null : achievementRatio(b.gusLabourMtd, b.gusRoMtd)));

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      <VpHeader
        eyebrow="Nippon Group · Service"
        title="Regions"
        subtitle="Every branch's revenue per vehicle — Central, South and North, month-to-date."
        dates={data.dates}
        date={data.date}
        basePath="/vp/regions"
        flagHref={`/vp/regions?date=${data.date}&flag=1`}
      >
        <KeralaMapCard pins={pins} regionSummaries={regionSummaries} date={data.date} />
      </VpHeader>

      <div className="mt-6">
        <RevenuePerVehicleTable
          branches={data.report.branches}
          variant="compact"
          defaultOpen
          renderGusCell={(row, metric, value, plain) => {
            if (row.branch === "All branches" || value === null) return plain();
            const rank = (metric === "parts" ? partsRank : labourRank).get(row.branch) ?? null;
            return (
              <GusPerCarCell
                branch={row.branch}
                metric={metric}
                value={value}
                className={bandClassName(value, metric === "parts" ? PARTS_PER_RO_BANDS : LABOUR_PER_RO_BANDS)}
                rank={rank}
                date={data.date}
              />
            );
          }}
        />
      </div>

      <FlagComposer page="region" date={data.date} />
    </div>
  );
}
