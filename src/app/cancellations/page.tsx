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
import { reconcileCancellations, type ReconcileRow, type ReconcileStatus } from "@/lib/cancellation/reconcile";
import { isJustificationOverdue, justificationStatus, loadJustifications } from "@/lib/cancellation/justifications";
import { MonthSelect, BranchSelect } from "./month-select";
import { JustificationBox } from "./justification-box";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
};
const STATUS_LABEL: Record<ReconcileStatus, string> = {
  adjusted: "Adjusted",
  replaced: "Replaced — absorbed",
  stale: "Still in Cost & Sales",
  after_kpi_cutoff: "After last KPI pull",
  // Both GS and BP are checked as of 2026-10-07 (see reconcile.ts) — this
  // now means neither report has the RO at all, not just "might be BP".
  unverified: "Can't verify (no Cost & Sales data on file for this RO)",
};

/** A stale row closed by an Accessories-staff SA isn't just "might still be
 * counted" — SSRV089's Accessories deduction (see
 * lib/ssrv089/cancellation-adjustment.ts) has no cancellation awareness of
 * its own, so this is subtracted from GUS Parts/Labour MTD (Total Revenue)
 * every day until the branch re-uploads a corrected SSRV089. Distinct label
 * so it doesn't blend in with an ordinary stale row. Accessories-staff
 * matching is GS-only, so this branch is never reached for a BP row. */
function statusLabel(r: {
  status: ReconcileStatus;
  accessoriesImpact: boolean;
  refDocNo: string | null;
  crossMonthReplacement?: { usingOriginalValue: boolean; skipAdjustment: boolean };
}): string {
  // RO prefix (GSJ… vs BPE…) says which report the row actually lives in —
  // both are scanned together as of 2026-10-07 (see reconcile.ts), so a
  // stale row needs its own variant called out, same as the upload page
  // already distinguishes "Cost and Sales Report - GS" from "- BP".
  const variant = r.refDocNo?.toUpperCase().startsWith("BPE") ? "BP" : "GS";
  if (r.status === "stale" && r.accessoriesImpact) return `Still in Cost & Sales (${variant}) — deducted from Total Revenue`;
  if (r.status === "stale") return `Still in Cost & Sales (${variant})`;
  // The rule (2026-10-07): the CANCELLED invoice's own value is what's
  // excluded, not the replacement's — except when that original row can't
  // be found, or the replacement predates NEW_RULE_CUTOVER_DATE, where it
  // still falls back to the old (replacement-value) behavior. See
  // cross-month-replacement.ts's doc comment.
  if (r.status === "adjusted") {
    if (r.crossMonthReplacement?.skipAdjustment) return "Adjusted (none needed)";
    return r.crossMonthReplacement?.usingOriginalValue ? "Adjusted" : "Adjusted (fallback)";
  }
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
  const justifications = await loadJustifications(flagged.map((r) => r.docNo));
  // branch/regional/hq only — every other role redirected away above.
  const viewerRole: "hq" | "branch" | "regional" = admin.role === "branch" ? "branch" : admin.role === "regional" ? "regional" : "hq";

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
    <div className="space-y-6">
      {/* Header */}
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
      <div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Tile label="Cancellations" value={String(totalCount)} />
          <Tile label="Value (before tax)" value={formatCompactCurrency(totalValue)} />
          <Tile
            label="Data-entry mistakes"
            value={`${totalDataEntry}${totalCount ? ` · ${Math.round((totalDataEntry / totalCount) * 100)}%` : ""}`}
          />
          <Tile label="Cancelled for warranty" value={String(totalWarranty)} />
        </div>

        {soloBranch && filesByBranch.has(soloBranch) ? (
          <div className="mt-2.5 text-[13px]">
            <span className="text-fg-faint">
              {soloBranch} report{filesByBranch.get(soloBranch)!.length === 1 ? "" : "s"}
              {filesByBranch.get(soloBranch)!.length > 1 ? " (multiple rounds)" : ""}:
            </span>{" "}
            {filesByBranch.get(soloBranch)!.map((f, i) => (
              <span key={f.id}>
                {i > 0 ? <span className="mx-1.5 text-fg-faint">·</span> : null}
                <a href={pdfHref(f.branch, f.id)} target="_blank" rel="noreferrer" className="text-accent-text hover:underline">
                  {uploadLabel(f.uploadedAt)} (PDF)
                </a>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Reconciliation */}
      <Section title="Reconciliation">
        {flagged.length === 0 ? (
          <StatusBanner tone="good">
            Every cancellation this month is either replaced by a fresh invoice or was cancelled before the branch&apos;s last Monthly
            KPI pull — nothing is likely still sitting in the figures.
          </StatusBanner>
        ) : (
          <div className="space-y-2.5">
            <StatusBanner tone="bad">
              <strong>{flagged.length}</strong> cancellation{flagged.length === 1 ? "" : "s"} (<strong>{inr(flaggedValue)}</strong>{" "}
              before tax) may still be in {monthLabel(month)}&apos;s figures.
              {accessoriesImpacted.length > 0 ? (
                <>
                  {" "}
                  <strong>{accessoriesImpacted.length}</strong> ({inr(accessoriesImpactedValue)}) confirmed still being deducted from
                  Total Revenue right now, not just &quot;might be.&quot;
                </>
              ) : null}
            </StatusBanner>
            <div className="space-y-2">
              {flagged.map((r) => {
                const justification = justifications.get(r.docNo);
                const status = justificationStatus(justification);
                const overdue = isJustificationOverdue(r.cancelAt, justification);
                return (
                  <FlaggedRowCard key={r.docNo} r={r} overdue={overdue}>
                    <JustificationBox
                      docNo={r.docNo}
                      viewerRole={viewerRole}
                      status={status}
                      branchNote={justification?.branchNote ?? null}
                      regionalNote={justification?.regionalNote ?? null}
                      overdue={overdue}
                    />
                  </FlaggedRowCard>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      {/* Cross-month replacements — a cancelled invoice's job re-invoiced in a
          later month, whose value has been excluded from that later month's
          revenue rather than double-counted on top of the original (earlier)
          month, which already has it. Informational, not a flag — the
          adjustment is already applied. */}
      {adjusted.length > 0 ? (
        <Section title="Cross-month replacements — adjusted">
          <p className="text-[12.5px] text-fg-faint">
            Re-invoiced under a new invoice number in a later month. The original invoice&apos;s value — already counted in its own
            month — is excluded from the month the replacement landed in, so each job&apos;s real value is only ever counted once.
          </p>
          <div className="mt-2 space-y-2">
            {adjusted.map((r) => (
              <AdjustedRowCard key={r.docNo} r={r} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* Per-branch summary */}
      {kpis.length > 1 ? (
        <Section title="By branch">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {kpis.map((k) => (
              <div key={k.branch} className="rounded-lg border border-border bg-surface p-3.5">
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
        </Section>
      ) : null}
    </div>,
  );
}

/** Section wrapper — small-caps eyebrow label + content, consistent across
 * the page (replaces each section's own ad hoc `mt-*`/border combo). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={`${eyebrow} mb-2`}>{title}</div>
      {children}
    </div>
  );
}

/** A quiet left-accent status line, replacing the old full-bleed tinted
 * panel — same information, less visual weight. */
function StatusBanner({ tone, children }: { tone: "good" | "bad"; children: React.ReactNode }) {
  const toneClass = tone === "good" ? "border-good text-good" : "border-bad text-bad";
  return <div className={`rounded-md border-l-[3px] bg-surface py-2 pl-3 pr-2.5 text-[13px] leading-snug ${toneClass}`}>{children}</div>;
}

function Pill({ tone, children }: { tone: "bad" | "neutral"; children: React.ReactNode }) {
  const toneClass = tone === "bad" ? "border-bad/40 bg-bad-soft text-bad" : "border-border-strong bg-surface-2 text-fg-muted";
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${toneClass}`}>
      {children}
    </span>
  );
}

/** One flagged (needs-a-look) cancellation — invoice identity + amount on
 * top, status/reason/timing as compact pills below, the justification
 * control (passed as children) last. Replaces the old single run-on
 * sentence `<li>`. */
function FlaggedRowCard({ r, overdue, children }: { r: ReconcileRow; overdue: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="text-[13px]">
          <span className="font-medium text-fg">{r.branch}</span> <span className="text-fg-faint">·</span>{" "}
          <span className="text-fg-muted">{r.docNo}</span>
          {r.refDocNo ? <span className="text-fg-faint"> (RO {r.refDocNo})</span> : null}
        </div>
        <div className="text-[13px] font-semibold text-fg">{inr(r.beforeTax)}</div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-subtle">
        <span>{r.cancelReason}</span>
        <Pill tone={r.accessoriesImpact ? "bad" : "neutral"}>{statusLabel(r)}</Pill>
        {overdue ? <Pill tone="bad">Overdue</Pill> : null}
      </div>
      {r.status === "after_kpi_cutoff" && r.lastKpiCutoff ? (
        <div className="mt-1 text-[11.5px] text-fg-faint">
          Cancelled {r.cancelDate} — KPI last refreshed{" "}
          {new Date(r.lastKpiCutoff).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** One cross-month-adjusted cancellation — same card shape as FlaggedRowCard
 * for visual consistency, with the replacement + exclusion detail below. */
function AdjustedRowCard({ r }: { r: ReconcileRow }) {
  const cm = r.crossMonthReplacement;
  const excludedPart = cm ? (cm.usingOriginalValue ? cm.originalPartSale! : cm.partSale) : 0;
  const excludedLabour = cm ? (cm.usingOriginalValue ? cm.originalLabourSale! : cm.labourSale) : 0;
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="text-[13px]">
          <span className="font-medium text-fg">{r.branch}</span> <span className="text-fg-faint">·</span>{" "}
          <span className="text-fg-muted">{r.docNo}</span>
          {r.refDocNo ? <span className="text-fg-faint"> (RO {r.refDocNo})</span> : null}
        </div>
        <div className="text-[13px] font-semibold text-fg">{inr(r.beforeTax)}</div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-subtle">
        <span>{r.cancelReason}</span>
        <Pill tone="neutral">{statusLabel(r)}</Pill>
      </div>
      {cm ? (
        <div className="mt-1.5 text-[12px] text-fg-muted">
          Replaced by <span className="text-fg">{cm.replacementDocNo}</span> in {monthLabel(cm.replacementMonth)}
          {cm.skipAdjustment ? (
            <>
              {" "}— <span className="font-medium text-fg">nothing excluded</span>
              <div className="mt-0.5 text-[11.5px] text-fg-faint">
                Cancelled before that month&apos;s own KPI pull — already excluded there, so no adjustment is needed here.
              </div>
            </>
          ) : (
            <>
              {" "}—{" "}
              <span className="font-medium text-fg">{inr(excludedPart + excludedLabour)}</span> excluded ({inr(excludedPart)} parts,{" "}
              {inr(excludedLabour)} labour)
              {!cm.usingOriginalValue ? (
                <div className="mt-0.5 text-[11.5px] text-fg-faint">
                  Using the replacement&apos;s own value ({inr(cm.partSale)} parts, {inr(cm.labourSale)} labour) instead —{" "}
                  {cm.originalPartSale === null ? "the original invoice's own row couldn't be found" : "replaced before the rule change"}.
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
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
