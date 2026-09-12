import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { achievementRatio, achievementTone } from "@/lib/aggregate";
import { adminIdentityLabel } from "@/lib/admin-store";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import { regionForBranch, REGIONS, type RegionName } from "@/lib/regions";
import { branchOptionsByRegion, loadVpData } from "@/lib/vp-data";
import { DAILY_REPORT_ROWS, branchCell } from "../../dashboard/daily-report-rows";
import { BranchPicker } from "../branch-picker";
import { FlagComposer } from "../flag-composer";
import { requireVpAccess } from "../vp-guard";
import { VpHeader } from "../vp-header";

const TONE_TEXT = { good: "text-good", warn: "text-warn", critical: "text-bad", neutral: "text-fg" } as const;
const TONE_BAR = { good: "bg-good-solid", warn: "bg-warn-solid", critical: "bg-bad-solid", neutral: "bg-border-strong" } as const;

/** Calendar-day pace: MTD ÷ day-of-month × days-in-month. A rough month-end
 * projection — calendar days, not working days (noted on the page). */
function paceProjection(mtd: number | null, dateIso: string): number | null {
  if (mtd === null) return null;
  const [y, m, d] = dateIso.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  if (d <= 0) return null;
  return (mtd / d) * daysInMonth;
}

export default async function VpBranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; branch?: string; region?: string; flag?: string }>;
}) {
  const admin = await requireVpAccess();
  return (
    // Branch detail lives inside the Regions section — no nav item of its own.
    <AppShell current="vp-regions" showDashboardLink vpNav identity={adminIdentityLabel(admin)}>
      <Suspense fallback={<DashboardPageSkeleton />}>
        <Branch searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Branch({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; branch?: string; region?: string; flag?: string }>;
}) {
  const params = await searchParams;
  const data = await loadVpData(params.date);
  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <VpHeader eyebrow="Nippon Group · Service" title="Branch" flagHref="/vp/regions?flag=1" backHref="/vp/regions" backLabel="Regions" />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
      </div>
    );
  }

  const selected = params.branch && data.report.branches.some((b) => b.branch === params.branch) ? params.branch : null;
  // The only way in is clicking a branch on Regions — with no branch, send them back.
  if (!selected) redirect(`/vp/regions?date=${data.date}`);

  const branch = data.report.branches.find((b) => b.branch === selected)!;
  const region = regionForBranch(branch.branch);
  const fromRegion = params.region && params.region in REGIONS ? (params.region as RegionName) : null;
  const groups = branchOptionsByRegion(data.report).filter((g) => g.branches.length > 0);
  const flagBase = `/vp/branches?date=${data.date}&branch=${selected}${fromRegion ? `&region=${fromRegion}` : ""}`;
  const backHref = `/vp/regions?date=${data.date}${fromRegion ? `&region=${fromRegion}` : ""}`;

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <VpHeader
        eyebrow="Nippon Group · Service"
        title={branch.branch}
        subtitle={`${region ?? "—"} region · month-to-date, with a run-rate projection to month-end.`}
        dates={data.dates}
        date={data.date}
        basePath="/vp/branches"
        dateExtraParams={{ branch: selected, ...(fromRegion ? { region: fromRegion } : {}) }}
        flagHref={`${flagBase}&fbranch=${branch.branch}&flag=1`}
        backHref={backHref}
        backLabel={fromRegion ?? "Regions"}
      >
        <BranchPicker groups={groups} selected={selected} />
      </VpHeader>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Total Revenue · MTD" value={formatCompactCurrency(branch.totalRevenueStreamMtd)} accent />
        <MiniStat label="GUS RO · MTD" value={branch.gusRoMtd?.toLocaleString("en-IN") ?? "—"} />
        <MiniStat label="BPU RO · MTD" value={branch.bpuRoMtd?.toLocaleString("en-IN") ?? "—"} />
        <MiniStat
          label="VAS Achievement"
          value={formatPercent(achievementRatio(branch.vasAchievementForTheMonth, branch.vasBillTarget))}
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="[&>th]:border-b [&>th]:border-border">
              <th className="bg-surface py-2.5 pl-5 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-faint">Metric</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Today</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">MTD</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Target</th>
              <th className="bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Ach.</th>
              <th className="bg-accent-soft/40 px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-text">Pace →EoM</th>
              <th className="w-8 bg-surface print:hidden" />
            </tr>
          </thead>
          <tbody>
            {DAILY_REPORT_ROWS.map((row, i) => {
              if (row.kind === "group") {
                return (
                  <tr key={`g${i}`}>
                    <td colSpan={7} className="border-t border-border bg-surface-2/70 py-2 pl-5 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                      <span className="border-l-2 border-accent pl-2">{row.label}</span>
                    </td>
                  </tr>
                );
              }
              const cell = branchCell(row, branch);
              const pace = row.summable ? paceProjection(cell.mtd, data.date) : null;
              const tone = achievementTone(cell.ratio);
              return (
                <tr key={`m${i}`} className={`border-t border-border-subtle hover:bg-surface-2/40 ${row.strong ? "bg-accent-soft/25" : ""}`}>
                  <td className={`whitespace-nowrap py-2 pl-5 pr-3 ${row.strong ? "font-semibold text-fg" : "text-fg-muted"}`}>{row.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{cell.today == null ? "—" : row.fmt(cell.today)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${row.strong ? "font-semibold text-fg" : "text-fg"}`}>
                    {cell.mtd == null ? "—" : row.fmt(cell.mtd)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-fg-subtle">{cell.target == null ? "—" : row.fmt(cell.target)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${cell.ratio == null ? "text-fg-faint" : TONE_TEXT[tone]}`}>
                    {cell.ratio == null ? (
                      "—"
                    ) : (
                      <span className="inline-flex items-center justify-end gap-2">
                        <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-surface-2 sm:inline-block">
                          <span className={`block h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${Math.min(100, Math.round(cell.ratio * 100))}%` }} />
                        </span>
                        {Math.round(cell.ratio * 100)}%
                      </span>
                    )}
                  </td>
                  <td className="bg-accent-soft/20 px-4 py-2 text-right tabular-nums text-fg-subtle">{pace == null ? "—" : row.fmt(pace)}</td>
                  <td className="px-2 text-right print:hidden">
                    <Link
                      href={`${flagBase}&fbranch=${branch.branch}&fmetric=${encodeURIComponent(row.label)}&fvalue=${encodeURIComponent(cell.mtd == null ? "" : row.fmt(cell.mtd))}&flag=1`}
                      title={`Raise a query about ${branch.branch} · ${row.label}`}
                      className="text-fg-faint hover:text-accent-text"
                    >
                      <svg viewBox="0 0 16 16" className="inline h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                        <path d="M4 2v12M4 3h8l-1.5 2.5L12 8H4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-fg-faint">
        Pace →EoM projects month-end from the current run-rate on calendar days (MTD ÷ day-of-month × days-in-month) — a
        rough guide, not working-day adjusted.
      </p>

      <FlagComposer page="branch" date={data.date} />
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3.5 shadow-card ${accent ? "border-accent/30 bg-accent-soft/40" : "border-border bg-surface"}`}>
      <div className="text-[11px] font-medium uppercase tracking-[0.07em] text-fg-faint">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-fg">{value}</div>
    </div>
  );
}
