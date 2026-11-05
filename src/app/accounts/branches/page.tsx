import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { DraftWarning } from "@/components/draft-warning";
import { adminIdentityLabel } from "@/lib/admin-store";
import { loadAccountsData } from "@/lib/accounts-data";
import { branchName } from "@/lib/branch-names";
import { formatCompactCurrency } from "@/lib/format";
import { REGION_COLOR, REGIONS, type RegionName } from "@/lib/regions";
import { REPORT_TYPE_LABELS, type ReportTypeKey } from "@/lib/pending-uploads";
import type { BranchReport } from "@/lib/report";
import { branchCell, regionTotalCell } from "../../dashboard/daily-report-rows";
import { requireAccountsAccess } from "../accounts-guard";
import { AccountsHeader } from "../accounts-header";
import { FINANCIAL_ROWS, UNITS_SERVICED_ROWS, gusVsBpuRoSplitRow } from "../financial-rows";
import { GusVsBpuSplitCell } from "../gus-vs-bpu-split-cell";
import { tglossText } from "@/components/tgloss-text";

export default async function AccountsBranchesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const admin = await requireAccountsAccess();
  return (
    <AppShell current="accounts" showDashboardLink accountsNav identity={adminIdentityLabel(admin)}>
      <Suspense fallback={<DashboardPageSkeleton />}>
        <Branches searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Branches({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const data = await loadAccountsData(params.date);

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <AccountsHeader eyebrow="Nippon Group · Accounts" title="Branches" backHref="/accounts" backLabel="Overview" />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool reports have been uploaded yet.
        </div>
      </div>
    );
  }
  if (!data.report || !data.group) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <AccountsHeader
          eyebrow="Nippon Group · Accounts"
          title="Branches"
          dates={data.dates}
          date={data.date}
          basePath="/accounts/branches"
          backHref={`/accounts?date=${data.date}`}
          backLabel="Overview"
        />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool report on file for {data.date}.
        </div>
      </div>
    );
  }

  // Group every branch into its region, in REGIONS' fixed order, rather than
  // relying on report.branches' own (unspecified) order — this is what makes
  // the table's region bands consistent run to run. A region code absent
  // from today's report (e.g. CO01C on a day the online store didn't
  // transact) is simply skipped, same as the rest of the app already treats
  // that as expected, not an error.
  const branchMap = new Map(data.report.branches.map((b) => [b.branch, b]));
  const bands = (Object.keys(REGIONS) as RegionName[]).map((region) => ({
    region,
    branches: REGIONS[region].map((code) => branchMap.get(code)).filter((b): b is BranchReport => b != null),
  }));
  const allBranches = bands.flatMap((b) => b.branches);

  const missingBranches = [...data.missingUploadsByBranch.keys()].filter((code) => branchMap.has(code)).sort();

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-8">
      {!data.isPublished && (
        <DraftWarning
          uploadedBranches={data.uploadedBranchCount}
          totalBranches={data.totalBranchCount}
          missingBranches={missingBranches}
          holiday={data.holiday}
        />
      )}
      <AccountsHeader
        eyebrow="Nippon Group · Accounts"
        title="Branches — revenue breakdown"
        subtitle={`${allBranches.length} branches, month-to-date.`}
        dates={data.dates}
        date={data.date}
        basePath="/accounts/branches"
        backHref={`/accounts?date=${data.date}`}
        backLabel="Overview"
      />

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
        <table className="border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-20 [&>th]:border-b [&>th]:border-border">
              <th className="sticky left-0 z-30 bg-surface py-2.5 pl-5 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-faint">
                Metric
              </th>
              {bands.map((band) =>
                band.branches.map((b, i) => {
                  const missing = data.missingUploadsByBranch.get(b.branch);
                  return (
                    <th
                      key={b.branch}
                      className={`whitespace-nowrap bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle ${
                        i === 0 ? "border-l-2 border-border-strong" : ""
                      }`}
                      title={`${branchName(b.branch)}${
                        missing && missing.length > 0 ? ` — missing: ${missing.map((t: ReportTypeKey) => REPORT_TYPE_LABELS[t]).join(", ")}` : ""
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: REGION_COLOR[band.region] }} />
                        {b.branch}
                        {missing && missing.length > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-warn-solid" /> : null}
                      </span>
                    </th>
                  );
                }),
              )}
              <th className="sticky right-0 z-30 whitespace-nowrap bg-accent-soft px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-text">
                Company
              </th>
            </tr>
          </thead>
          <tbody>
            {[...FINANCIAL_ROWS, ...UNITS_SERVICED_ROWS].map((row, i) => {
              if (row.kind === "group") {
                return (
                  <tr key={`g${i}`}>
                    <td
                      colSpan={allBranches.length + 2}
                      className="border-t border-border bg-surface-2/70 py-2 pl-5 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle"
                    >
                      <span className="border-l-2 border-accent pl-2">{tglossText(row.label)}</span>
                    </td>
                  </tr>
                );
              }
              const totalCell = regionTotalCell(row, allBranches);
              return (
                <tr key={`m${i}`} className="border-t border-border-subtle hover:bg-surface-2/40">
                  <td className={`sticky left-0 z-10 whitespace-nowrap bg-surface py-2 pl-5 pr-3 ${row.strong ? "font-semibold text-fg" : "text-fg-muted"}`}>
                    {tglossText(row.label)}
                  </td>
                  {bands.map((band) =>
                    band.branches.map((b, i2) => {
                      const cell = branchCell(row, b);
                      return (
                        <td
                          key={b.branch}
                          className={`whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg ${i2 === 0 ? "border-l-2 border-border-subtle" : ""}`}
                        >
                          {cell.display == null ? <span className="text-fg-faint">—</span> : row.fmt(cell.display)}
                        </td>
                      );
                    }),
                  )}
                  <td className="sticky right-0 z-10 whitespace-nowrap bg-accent-soft/60 px-4 py-2 text-right font-semibold tabular-nums text-fg">
                    {totalCell.display == null ? <span className="text-fg-faint">—</span> : row.fmt(totalCell.display)}
                  </td>
                </tr>
              );
            })}

            <tr className="border-t border-border-subtle hover:bg-surface-2/40">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-2 pl-5 pr-3 text-fg-muted">{gusVsBpuRoSplitRow.label}</td>
              {bands.map((band) =>
                band.branches.map((b) => <GusVsBpuSplitCell key={b.branch} gus={gusVsBpuRoSplitRow.gus(b)} bpu={gusVsBpuRoSplitRow.bpu(b)} />),
              )}
              <GusVsBpuSplitCell
                gus={allBranches.reduce((sum, b) => sum + (gusVsBpuRoSplitRow.gus(b) ?? 0), 0)}
                bpu={allBranches.reduce((sum, b) => sum + (gusVsBpuRoSplitRow.bpu(b) ?? 0), 0)}
              />
            </tr>

            <tr>
              <td colSpan={allBranches.length + 2} className="border-t border-border bg-surface-2/70 py-2 pl-5 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                <span className="border-l-2 border-accent pl-2">Cancellations · {data.month}</span>
              </td>
            </tr>
            <tr className="border-t border-border-subtle hover:bg-surface-2/40">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-2 pl-5 pr-3 text-fg-muted">Cancelled (before tax)</td>
              {bands.map((band) =>
                band.branches.map((b, i2) => {
                  const c = data.cancellationsByBranch.get(b.branch);
                  return (
                    <td key={b.branch} className={`whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg ${i2 === 0 ? "border-l-2 border-border-subtle" : ""}`}>
                      {c ? formatCompactCurrency(c.beforeTaxTotal) : <span className="text-fg-faint">—</span>}
                    </td>
                  );
                }),
              )}
              <td className="sticky right-0 z-10 whitespace-nowrap bg-accent-soft/60 px-4 py-2 text-right font-semibold tabular-nums text-fg">
                {formatCompactCurrency(data.group.cancellations.beforeTaxTotal)}
              </td>
            </tr>
            <tr className="border-t border-border-subtle hover:bg-surface-2/40">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-2 pl-5 pr-3 text-fg-muted">Cancelled invoices (count)</td>
              {bands.map((band) =>
                band.branches.map((b, i2) => {
                  const c = data.cancellationsByBranch.get(b.branch);
                  return (
                    <td key={b.branch} className={`whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg ${i2 === 0 ? "border-l-2 border-border-subtle" : ""}`}>
                      {c ? c.count : <span className="text-fg-faint">—</span>}
                    </td>
                  );
                }),
              )}
              <td className="sticky right-0 z-10 whitespace-nowrap bg-accent-soft/60 px-4 py-2 text-right font-semibold tabular-nums text-fg">
                {data.group.cancellations.count}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-fg-faint">
        Cancellations are gross, not netted from any revenue row above — invoice_cancellations is control/audit data, kept
        separate deliberately. Branch columns are grouped Central · South · North (colored dot in each header); a warning dot
        marks a branch still missing one or more of today&apos;s reports — hover a branch code for details.
      </p>
    </div>
  );
}
