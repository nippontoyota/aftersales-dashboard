import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardPageSkeleton } from "@/components/dashboard-page-skeleton";
import { adminIdentityLabel } from "@/lib/admin-store";
import { loadAccountsData } from "@/lib/accounts-data";
import { formatCompactCurrency } from "@/lib/format";
import type { RegionName } from "@/lib/regions";
import { branchCell, regionTotalCell } from "../../dashboard/daily-report-rows";
import { requireAccountsAccess } from "../accounts-guard";
import { AccountsHeader } from "../accounts-header";
import { FINANCIAL_ROWS } from "../financial-rows";
import { tglossText } from "@/components/tgloss-text";

export default async function AccountsBranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; region?: string }>;
}) {
  const admin = await requireAccountsAccess();
  return (
    <AppShell current="accounts" showDashboardLink accountsNav identity={adminIdentityLabel(admin)}>
      <Suspense fallback={<DashboardPageSkeleton />}>
        <Branches searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function Branches({ searchParams }: { searchParams: Promise<{ date?: string; region?: string }> }) {
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
  if (!data.report) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <AccountsHeader
          eyebrow="Nippon Group · Accounts"
          title="Branches"
          dates={data.dates}
          date={data.date}
          basePath="/accounts/branches"
          dateExtraParams={params.region ? { region: params.region } : undefined}
          backHref={`/accounts?date=${data.date}`}
          backLabel="Overview"
        />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          No BA Tool report on file for {data.date}.
        </div>
      </div>
    );
  }

  const region = (["North", "Central", "South"] as RegionName[]).find((r) => r === params.region);
  const rollup = region ? data.regions.find((r) => r.region === region) : null;
  if (!region || !rollup) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <AccountsHeader eyebrow="Nippon Group · Accounts" title="Branches" backHref="/accounts" backLabel="Overview" />
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-sm text-fg-subtle">
          Pick a region from the overview to see its branches.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <AccountsHeader
        eyebrow="Nippon Group · Accounts"
        title={`${region} — revenue breakdown`}
        subtitle={`${rollup.branches.length} branches, month-to-date.`}
        dates={data.dates}
        date={data.date}
        basePath="/accounts/branches"
        dateExtraParams={{ region }}
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
              {rollup.branches.map((b) => (
                <th key={b.branch} className="whitespace-nowrap bg-surface px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                  {b.branch}
                </th>
              ))}
              <th className="whitespace-nowrap bg-accent-soft/50 px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-text">
                {region}
              </th>
            </tr>
          </thead>
          <tbody>
            {FINANCIAL_ROWS.map((row, i) => {
              if (row.kind === "group") {
                return (
                  <tr key={`g${i}`}>
                    <td
                      colSpan={rollup.branches.length + 2}
                      className="border-t border-border bg-surface-2/70 py-2 pl-5 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle"
                    >
                      <span className="border-l-2 border-accent pl-2">{tglossText(row.label)}</span>
                    </td>
                  </tr>
                );
              }
              const totalCell = regionTotalCell(row, rollup.branches);
              return (
                <tr key={`m${i}`} className="border-t border-border-subtle hover:bg-surface-2/40">
                  <td className={`sticky left-0 z-10 whitespace-nowrap bg-surface py-2 pl-5 pr-3 ${row.strong ? "font-semibold text-fg" : "text-fg-muted"}`}>
                    {tglossText(row.label)}
                  </td>
                  {rollup.branches.map((b) => {
                    const cell = branchCell(row, b);
                    return (
                      <td key={b.branch} className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg">
                        {cell.display == null ? <span className="text-fg-faint">—</span> : row.fmt(cell.display)}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap bg-accent-soft/30 px-4 py-2 text-right font-semibold tabular-nums text-fg">
                    {totalCell.display == null ? <span className="text-fg-faint">—</span> : row.fmt(totalCell.display)}
                  </td>
                </tr>
              );
            })}

            <tr>
              <td colSpan={rollup.branches.length + 2} className="border-t border-border bg-surface-2/70 py-2 pl-5 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                <span className="border-l-2 border-accent pl-2">Cancellations · {data.month}</span>
              </td>
            </tr>
            <tr className="border-t border-border-subtle hover:bg-surface-2/40">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-2 pl-5 pr-3 text-fg-muted">Cancelled (before tax)</td>
              {rollup.branches.map((b) => {
                const c = data.cancellationsByBranch.get(b.branch);
                return (
                  <td key={b.branch} className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg">
                    {c ? formatCompactCurrency(c.beforeTaxTotal) : <span className="text-fg-faint">—</span>}
                  </td>
                );
              })}
              <td className="whitespace-nowrap bg-accent-soft/30 px-4 py-2 text-right font-semibold tabular-nums text-fg">
                {formatCompactCurrency(rollup.cancellations.beforeTaxTotal)}
              </td>
            </tr>
            <tr className="border-t border-border-subtle hover:bg-surface-2/40">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-2 pl-5 pr-3 text-fg-muted">Cancelled invoices (count)</td>
              {rollup.branches.map((b) => {
                const c = data.cancellationsByBranch.get(b.branch);
                return (
                  <td key={b.branch} className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-fg">
                    {c ? c.count : <span className="text-fg-faint">—</span>}
                  </td>
                );
              })}
              <td className="whitespace-nowrap bg-accent-soft/30 px-4 py-2 text-right font-semibold tabular-nums text-fg">{rollup.cancellations.count}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-fg-faint">
        Cancellations are gross, not netted from any revenue row above — invoice_cancellations is control/audit data, kept
        separate deliberately.
      </p>
    </div>
  );
}
