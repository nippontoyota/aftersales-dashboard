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
  loadCancellationMonthSummaries,
  listCancellationFiles,
  type CancellationFileInfo,
} from "@/lib/cancellation/store";
import { reconcileCancellations, type ReconcileStatus } from "@/lib/cancellation/reconcile";
import { MonthSelect, BranchSelect } from "./month-select";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
};
const STATUS_LABEL: Record<ReconcileStatus, string> = {
  adjusted: "Adjusted — replacement excluded",
  replaced: "Replaced — absorbed",
  stale: "Still in SSRV089",
  after_kpi_cutoff: "After last KPI pull",
  unverified: "Can't verify (BP / no SSRV089)",
};

/** A stale row closed by an Accessories-staff SA isn't just "might still be
 * counted" — SSRV089's Accessories deduction (see
 * lib/ssrv089/cancellation-adjustment.ts) has no cancellation awareness of
 * its own, so this is subtracted from GUS Parts/Labour MTD (Total Revenue)
 * every day until the branch re-uploads a corrected SSRV089. Distinct label
 * so it doesn't blend in with an ordinary stale GS row. */
function statusLabel(r: { status: ReconcileStatus; accessoriesImpact: boolean }): string {
  if (r.status === "stale" && r.accessoriesImpact) return "Still in SSRV089 — deducted from Total Revenue (Accessories)";
  return STATUS_LABEL[r.status];
}

export default async function CancellationsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branch?: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (admin.role === "vp_service") redirect("/vp");
  if (admin.role === "ceo") redirect("/ceo");
  if (admin.role === "accounts") redirect("/accounts");
  const nav = await loadNavState(admin);
  const identity = adminIdentityLabel(admin);
  const params = await searchParams;

  // Scope: HQ sees everything; a branch account sees only its own; a
  // regional manager sees its region's branches.
  const scopeBranches =
    admin.role === "branch" ? [admin.branch] : admin.role === "regional" ? [...REGIONS[admin.region]] : null;
  const scopeSet = scopeBranches ? new Set(scopeBranches) : null;

  const months = await loadCancellationMonths(scopeBranches?.length === 1 ? scopeBranches[0] : undefined);
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : months[0];

  let branchFilter =
    admin.role === "branch" ? admin.branch : params.branch && /^[A-Z0-9]{3,8}$/.test(params.branch) ? params.branch : undefined;
  if (branchFilter && scopeSet && !scopeSet.has(branchFilter)) branchFilter = undefined;

  const shell = (body: React.ReactNode) => (
    <AppShell
      current="cancellations"
      showDashboardLink={admin.canViewDashboard}
      isHq={admin.role === "hq"}
      companyTabs={nav.companyTabs}
      canUpload={nav.canUpload}
      slimNav={nav.slimNav}
      isRegional={admin.role === "regional"}
      isBranch={admin.role === "branch"}
      centralNav={admin.role === "regional" && admin.region === "Central"}
      queriesBadge={nav.queriesBadge}
      dashboardLabel={nav.dashboardLabel}
      identity={identity}
    >
      <div className="mx-auto w-full max-w-[1100px] p-6">{body}</div>
    </AppShell>
  );

  if (!month) {
    return shell(
      <>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Cancellations</h1>
        <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
          No Cancellation Reports have been uploaded yet.
          {admin.role !== "regional" ? " Upload the DMS report from the Upload page." : ""}
        </div>
      </>,
    );
  }

  const [kpis, reconcile, summaries, files] = await Promise.all([
    loadCancellationKpis(month, branchFilter ? [branchFilter] : scopeBranches ?? undefined),
    reconcileCancellations(month, branchFilter),
    loadCancellationMonthSummaries(scopeBranches?.length === 1 ? scopeBranches[0] : undefined),
    listCancellationFiles(month, branchFilter ? [branchFilter] : scopeBranches ?? undefined),
  ]);

  const filesByBranch = new Map<string, CancellationFileInfo[]>();
  for (const f of files) filesByBranch.set(f.branch, [...(filesByBranch.get(f.branch) ?? []), f]);

  const monthSummaries = summaries.filter((s) => s.month === month && (!scopeSet || scopeSet.has(s.branch)));
  const flagged = reconcile.rows.filter((r) => r.flagged && (!scopeSet || scopeSet.has(r.branch)));
  const flaggedValue = flagged.reduce((s, r) => s + r.beforeTax, 0);
  const accessoriesImpacted = flagged.filter((r) => r.accessoriesImpact);
  const accessoriesImpactedValue = accessoriesImpacted.reduce((s, r) => s + r.beforeTax, 0);
  const adjusted = reconcile.rows.filter((r) => r.status === "adjusted" && (!scopeSet || scopeSet.has(r.branch)));

  const totalCount = kpis.reduce((s, k) => s + k.count, 0);
  const totalValue = kpis.reduce((s, k) => s + k.beforeTaxTotal, 0);
  const totalDataEntry = kpis.reduce((s, k) => s + k.dataEntryMistakes, 0);
  const totalWarranty = kpis.reduce((s, k) => s + k.cancelledForWarranty, 0);

  const branchOptions = [...new Set(monthSummaries.map((s) => s.branch))].sort();
  const soloBranch = branchFilter ?? (branchOptions.length === 1 ? branchOptions[0] : undefined);
  const pdfHref = (b: string, id: number) => `/api/cancellations/${b}/${month}/pdf/${id}`;
  const uploadLabel = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

  return shell(
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Cancellations</h1>
          <p className="mt-1 text-[13px] text-fg-subtle">
            Tax invoices cancelled in {monthLabel(month)}. A control view — nothing here changes a revenue figure.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
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
        <Tile
          label="Data-entry mistakes"
          value={`${totalDataEntry}${totalCount ? ` · ${Math.round((totalDataEntry / totalCount) * 100)}%` : ""}`}
        />
        <Tile label="Cancelled for warranty" value={String(totalWarranty)} />
      </div>

      {soloBranch && filesByBranch.has(soloBranch) ? (
        <div className="mt-3 text-sm">
          <span className="text-fg-subtle">
            {soloBranch} report{filesByBranch.get(soloBranch)!.length === 1 ? "" : "s"} (full per-invoice detail
            {filesByBranch.get(soloBranch)!.length > 1 ? " — uploaded in multiple rounds, each PDF below" : ""}):
          </span>{" "}
          {filesByBranch.get(soloBranch)!.map((f, i) => (
            <span key={f.id}>
              {i > 0 ? <span className="mx-1.5 text-fg-faint">·</span> : null}
              <a
                href={pdfHref(f.branch, f.id)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 align-middle text-accent-text hover:underline"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
                  <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14" strokeLinecap="round" />
                </svg>
                {uploadLabel(f.uploadedAt)} (PDF)
              </a>
            </span>
          ))}
        </div>
      ) : null}

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
            {accessoriesImpacted.length > 0 ? (
              <div className="mt-1 font-medium text-bad">
                {accessoriesImpacted.length} of those ({inr(accessoriesImpactedValue)}) {accessoriesImpacted.length === 1 ? "is" : "are"} confirmed
                still being deducted from Total Revenue right now (Accessories-staff-closed, still in SSRV089) — not just &quot;might be,&quot; this one moves the number every day it&apos;s unresolved.
              </div>
            ) : null}
            <ul className="mt-2 space-y-1 text-fg-muted">
              {flagged.map((r) => (
                <li key={r.docNo}>
                  <span className="font-medium text-fg">{r.branch}</span> · {r.docNo}
                  {r.refDocNo ? ` (RO ${r.refDocNo})` : ""} · {inr(r.beforeTax)} · {r.cancelReason} ·{" "}
                  <span className={r.accessoriesImpact ? "font-medium text-bad" : "text-fg-subtle"}>{statusLabel(r)}</span>
                  {r.status === "after_kpi_cutoff" && r.lastKpiCutoff
                    ? ` — cancelled ${r.cancelDate}, KPI last refreshed ${new Date(r.lastKpiCutoff).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Cross-month replacements — a cancelled invoice's job re-invoiced in a
          later month, whose value has been excluded from that later month's
          revenue rather than double-counted on top of the original (earlier)
          month, which already has it. Informational, not a flag — the
          adjustment is already applied. */}
      {adjusted.length > 0 ? (
        <div className="mt-6">
          <div className={eyebrow}>Cross-month replacements — adjusted</div>
          <div className="mt-2 rounded-md border border-border bg-surface-subtle p-3 text-sm">
            <div className="text-fg-muted">
              {adjusted.length} cancellation{adjusted.length === 1 ? "" : "s"} {adjusted.length === 1 ? "was" : "were"} re-invoiced under a new
              invoice number in a later month. That job&apos;s revenue is already counted in its original month, so the replacement&apos;s value
              has been excluded from the month it landed in instead of being double-counted.
            </div>
            <ul className="mt-2 space-y-1 text-fg-muted">
              {adjusted.map((r) => (
                <li key={r.docNo}>
                  <span className="font-medium text-fg">{r.branch}</span> · {r.docNo}
                  {r.refDocNo ? ` (RO ${r.refDocNo})` : ""} · {inr(r.beforeTax)} · {r.cancelReason} ·{" "}
                  <span className="text-fg-subtle">{statusLabel(r)}</span>
                  {r.crossMonthReplacement
                    ? ` — replaced by ${r.crossMonthReplacement.replacementDocNo} in ${monthLabel(r.crossMonthReplacement.replacementMonth)}, ${inr(
                        r.crossMonthReplacement.partSale + r.crossMonthReplacement.labourSale
                      )} excluded from that month (${inr(r.crossMonthReplacement.partSale)} parts, ${inr(r.crossMonthReplacement.labourSale)} labour)`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Per-branch summary */}
      {kpis.length > 1 ? (
        <div className="mt-6">
          <div className={eyebrow}>By branch</div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kpis.map((k) => (
              <div key={k.branch} className="rounded-lg border border-border bg-surface p-3.5 shadow-card">
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
                      <span key={reason} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-muted">
                        {reason} {n}
                      </span>
                    ))}
                </div>
                {filesByBranch.has(k.branch) ? (
                  <div className="mt-2 flex flex-wrap gap-x-1.5 gap-y-1 text-xs">
                    {filesByBranch.get(k.branch)!.map((f) => (
                      <a key={f.id} href={pdfHref(f.branch, f.id)} target="_blank" rel="noreferrer" className="text-accent-text hover:underline">
                        {filesByBranch.get(k.branch)!.length > 1 ? `${uploadLabel(f.uploadedAt)} (PDF)` : "Open report (PDF)"}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>,
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-card">
      <div className="text-[11px] uppercase tracking-wide text-fg-faint">{label}</div>
      <div className="mt-1 text-xl font-semibold text-fg">{value}</div>
    </div>
  );
}
