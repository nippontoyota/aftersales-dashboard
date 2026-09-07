import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { adminIdentityLabel } from "@/lib/admin-store";
import { getCurrentAdmin } from "@/lib/auth";
import { loadNavState } from "@/lib/dashboard-data";
import { REGIONS } from "@/lib/regions";
import { eyebrow } from "@/lib/ui";
import { formatCompactCurrency } from "@/lib/format";
import {
  loadCancellationMonths,
  loadCancellationKpis,
  loadCancellationsForMonth,
} from "@/lib/cancellation/store";
import { reconcileCancellations, type ReconcileStatus } from "@/lib/cancellation/reconcile";
import { MonthSelect, BranchSelect } from "./month-select";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
};
const STATUS_LABEL: Record<ReconcileStatus, string> = {
  replaced: "Replaced — absorbed",
  stale: "Still in SSRV089",
  after_kpi_cutoff: "After last KPI pull",
  unverified: "Can't verify (BP / no SSRV089)",
};

export default async function CancellationsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branch?: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  const nav = await loadNavState(admin);
  const identity = adminIdentityLabel(admin);
  const params = await searchParams;

  // Scope: HQ sees everything; a branch account sees only its own; a
  // regional manager sees its region's branches.
  const scopeBranches =
    admin.role === "branch" ? [admin.branch] : admin.role === "regional" ? [...REGIONS[admin.region]] : null;

  const months = await loadCancellationMonths(scopeBranches?.length === 1 ? scopeBranches[0] : undefined);
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : months[0];

  let branchFilter =
    admin.role === "branch" ? admin.branch : params.branch && /^[A-Z0-9]{3,8}$/.test(params.branch) ? params.branch : undefined;
  if (branchFilter && scopeBranches && !scopeBranches.includes(branchFilter)) branchFilter = undefined;

  const shell = (
    body: React.ReactNode,
  ) => (
    <AppShell
      current="cancellations"
      showDashboardLink={admin.canViewDashboard}
      isHq={admin.role === "hq"}
      companyTabs={nav.companyTabs}
      canUpload={nav.canUpload}
      dashboardLabel={nav.dashboardLabel}
      identity={identity}
    >
      <div className="mx-auto w-full max-w-[1200px] p-6">{body}</div>
    </AppShell>
  );

  if (!month) {
    return shell(
      <>
        <h1 className="text-lg font-semibold text-fg">Cancellations</h1>
        <div className="mt-4 rounded border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          No Cancellation Reports have been uploaded yet.
          {admin.role === "hq" ? " Upload the monthly DMS report from the Upload page." : ""}
        </div>
      </>,
    );
  }

  const perBranchFilter = branchFilter ? [branchFilter] : scopeBranches ?? undefined;
  const [kpis, reconcile, rows] = await Promise.all([
    loadCancellationKpis(month, perBranchFilter),
    reconcileCancellations(month, branchFilter),
    loadCancellationsForMonth(month, branchFilter),
  ]);

  // Regional/HQ reconcile is unscoped by branch — trim to scope here.
  const reconcileRows = scopeBranches ? reconcile.rows.filter((r) => scopeBranches.includes(r.branch)) : reconcile.rows;
  const visibleRows = scopeBranches ? rows.filter((r) => scopeBranches.includes(r.branch)) : rows;
  const flagged = reconcileRows.filter((r) => r.flagged);
  const flaggedValue = flagged.reduce((s, r) => s + r.beforeTax, 0);

  const totalCount = kpis.reduce((s, k) => s + k.count, 0);
  const totalValue = kpis.reduce((s, k) => s + k.beforeTaxTotal, 0);
  const totalDataEntry = kpis.reduce((s, k) => s + k.dataEntryMistakes, 0);
  const totalWarranty = kpis.reduce((s, k) => s + k.cancelledForWarranty, 0);

  const branchOptions = admin.role === "hq" ? [...new Set(rows.map((r) => r.branch))].sort() : scopeBranches ?? [];

  return shell(
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-fg">Cancellations</h1>
          <p className="mt-0.5 text-sm text-fg-subtle">
            Tax invoices cancelled in {monthLabel(month)}. A control view — nothing here changes a revenue figure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthSelect months={months} selected={month} branch={branchFilter} />
          {admin.role === "hq" && branchOptions.length > 1 ? (
            <BranchSelect branches={branchOptions} selected={branchFilter ?? "All"} month={month} />
          ) : null}
        </div>
      </div>

      {/* Headline tiles */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Cancellations" value={String(totalCount)} />
        <Tile label="Value (before tax)" value={formatCompactCurrency(totalValue)} />
        <Tile label="Data-entry mistakes" value={`${totalDataEntry}${totalCount ? ` · ${Math.round((totalDataEntry / totalCount) * 100)}%` : ""}`} />
        <Tile label="Cancelled for warranty" value={String(totalWarranty)} />
      </div>

      {/* Reconciliation flag */}
      <div className="mt-6">
        <div className={eyebrow}>Reconciliation</div>
        {flagged.length === 0 ? (
          <div className="mt-2 rounded-md border border-good/30 bg-good-soft p-3 text-sm text-good">
            Every cancellation this month is either replaced by a fresh invoice or was cancelled before the branch&apos;s last
            Monthly KPI pull — nothing is likely still sitting in the figures.
          </div>
        ) : (
          <div className="mt-2 rounded-md border border-bad/30 bg-bad-soft p-3 text-sm">
            <div className="font-medium text-bad">
              {flagged.length} cancellation{flagged.length === 1 ? "" : "s"} ({inr(flaggedValue)} before tax) may still be in{" "}
              {monthLabel(month)}&apos;s figures.
            </div>
            <ul className="mt-2 space-y-1 text-fg-muted">
              {flagged.map((r) => (
                <li key={r.docNo}>
                  <span className="font-medium text-fg">{r.branch}</span> · {r.docNo}
                  {r.refDocNo ? ` (RO ${r.refDocNo})` : ""} · {inr(r.beforeTax)} · {r.cancelReason} ·{" "}
                  <span className="text-fg-subtle">{STATUS_LABEL[r.status]}</span>
                  {r.status === "after_kpi_cutoff" && r.lastKpiDate ? ` — cancelled ${r.cancelDate}, last KPI ${r.lastKpiDate}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Per-branch data quality */}
      {kpis.length > 1 ? (
        <div className="mt-6">
          <div className={eyebrow}>By branch</div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kpis.map((k) => (
              <div key={k.branch} className="rounded-md border border-border bg-surface p-3.5">
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-semibold text-fg">{k.branch}</div>
                  <div className="text-xs text-fg-subtle">{formatCompactCurrency(k.beforeTaxTotal)}</div>
                </div>
                <div className="mt-1 text-2xl font-semibold text-fg">{k.count}</div>
                <div className="mt-1 text-xs text-fg-subtle">
                  {k.dataEntryMistakes} data-entry · {k.cancelledForWarranty} warranty
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(k.byReason)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, n]) => (
                      <span key={reason} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-muted">
                        {reason} {n}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Full list */}
      <div className="mt-6">
        <div className={eyebrow}>All cancellations · {visibleRows.length}</div>
        <div className="mt-2 overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs text-fg-subtle">
                <th className="px-3 py-2 font-medium">Branch</th>
                <th className="px-3 py-2 font-medium">Cancel date</th>
                <th className="px-3 py-2 font-medium">DocNo</th>
                <th className="px-3 py-2 font-medium">RO</th>
                <th className="px-3 py-2 font-medium">Vehicle</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 text-right font-medium">Before tax</th>
                <th className="px-3 py-2 font-medium">Cancelled by</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.docNo} className="border-b border-border-subtle last:border-0">
                  <td className="px-3 py-2 text-fg-muted">{r.branch}</td>
                  <td className="px-3 py-2 text-fg-muted">{r.cancelDate}</td>
                  <td className="px-3 py-2 font-medium text-fg">{r.docNo}</td>
                  <td className="px-3 py-2 text-fg-muted">{r.refDocNo ?? "—"}</td>
                  <td className="px-3 py-2 text-fg-muted">{r.regNo ?? "—"}</td>
                  <td className="px-3 py-2 text-fg-muted">{r.docCustomer ?? r.ownerName ?? "—"}</td>
                  <td className="px-3 py-2 text-fg-muted">{r.cancelReason}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{inr(r.beforeTax)}</td>
                  <td className="px-3 py-2 text-fg-muted">{r.cancelledBy ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>,
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-[11px] uppercase tracking-wide text-fg-faint">{label}</div>
      <div className="mt-1 text-xl font-semibold text-fg">{value}</div>
    </div>
  );
}
