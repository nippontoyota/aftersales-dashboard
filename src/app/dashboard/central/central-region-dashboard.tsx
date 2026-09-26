import type { CentralRegionView, CentralMetricBlock, CentralBranchRow, CentralMetricStatus } from "@/lib/central-region-data";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import { eyebrow } from "@/lib/ui";
import { tglossText } from "@/components/tgloss-text";
import { DraftWarning } from "@/components/draft-warning";
import { DateSelect } from "../date-select";
import { IncentiveSlabIndicator } from "../incentive-slab-indicator";

const STATUS_LABEL: Record<CentralMetricStatus, string> = { achieved: "Achieved", onTrack: "On Track", behind: "Behind", unknown: "—" };
const STATUS_CHIP: Record<CentralMetricStatus, string> = {
  achieved: "bg-good-soft text-good",
  onTrack: "border border-good/40 border-dashed text-good",
  behind: "bg-bad-soft text-bad",
  unknown: "bg-surface-2 text-fg-faint",
};
const STATUS_BAR: Record<CentralMetricStatus, string> = {
  achieved: "bg-good-solid",
  onTrack: "bg-good-solid",
  behind: "bg-bad",
  unknown: "bg-border-strong",
};

function asOf(uploadedAt: string): string {
  return new Date(uploadedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function guidance(block: CentralMetricBlock, remaining: number): string {
  if (block.target === null || block.achieved === null) return "No target set";
  if (block.status === "achieved") return `Target met — ${formatCompactCurrency(-(block.gap ?? 0))} ahead`;
  if (remaining <= 0) return "No working days left this month";
  if (block.requiredPerWorkingDay !== null) return `Need ${formatCompactCurrency(block.requiredPerWorkingDay)}/working day × ${remaining}d left`;
  return "—";
}

function MetricCell({ block, remaining, title }: { block: CentralMetricBlock; remaining: number; title?: string }) {
  const pct = block.target !== null && block.target > 0 && block.achieved !== null ? Math.min(100, (block.achieved / block.target) * 100) : 0;
  return (
    <div className="min-w-[150px] space-y-1" title={title}>
      <div className="flex items-baseline justify-between gap-1 text-[12px]">
        <span className="font-semibold tabular-nums text-fg">{formatCompactCurrency(block.achieved)}</span>
        <span className="tabular-nums text-fg-faint">/ {formatCompactCurrency(block.target)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${STATUS_BAR[block.status]}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${STATUS_CHIP[block.status]}`}>{STATUS_LABEL[block.status]}</span>
        <span className="text-[10px] tabular-nums text-fg-faint">{formatPercent(block.mtdAchievementPct)} MTD</span>
      </div>
      <div className="text-[10px] leading-tight text-fg-subtle">
        Gap {formatCompactCurrency(block.gap !== null ? Math.max(0, block.gap) : null)} · Proj {formatCompactCurrency(block.projectedEom)}
      </div>
      <div className="text-[10px] leading-tight text-fg-faint">{guidance(block, remaining)}</div>
    </div>
  );
}

function Row({ label, cells, remaining }: { label: string; cells: { key: string; block: CentralMetricBlock; title?: string }[]; remaining: number }) {
  return (
    <tr className="border-t border-border-subtle align-top">
      <td className="py-3 pr-3 text-[12px] font-semibold text-fg">{label}</td>
      {cells.map((c) => (
        <td key={c.key} className="py-3 pr-4">
          <MetricCell block={c.block} remaining={remaining} title={c.title} />
        </td>
      ))}
    </tr>
  );
}

export function CentralRegionDashboard({
  view,
  dates,
  uploadedAt,
  isPublished,
}: {
  view: CentralRegionView;
  dates: string[];
  uploadedAt: string;
  isPublished: boolean;
}) {
  const columns = [
    ...view.branches,
    {
      branch: "Central Rgn" as const,
      label: "Central Rgn",
      gs: view.totals.gs,
      bp: view.totals.bp,
      ext: view.totals.ext,
      totalMonthlyTarget: view.totals.totalMonthlyTarget,
      totalAchieved: view.totals.totalAchieved,
      includesCo01e: false,
      slab: undefined,
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] p-6">
      {!isPublished && <DraftWarning uploadedBranches={view.uploadStatus.uploaded} totalBranches={view.uploadStatus.total} />}

      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Central — Regional Overview</h1>
          <p className="mt-1 text-xs text-fg-faint">Month-to-date for {view.date}. Data as of {asOf(uploadedAt)} IST.</p>
        </div>
        <DateSelect dates={dates} selected={view.date} region="All" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-border bg-surface p-3 shadow-card">
          <div className={eyebrow}>Region Achieved (GS+BP+Ext)</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-fg">{formatCompactCurrency(view.totals.totalAchieved)}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3 shadow-card">
          <div className={eyebrow}>Slab 4 target (all {view.branches.length} branches)</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-fg">{formatCompactCurrency(view.slab4Total)}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3 shadow-card">
          <div className={eyebrow}>Balance to Slab 4</div>
          <div className={`mt-1 text-lg font-semibold tabular-nums ${view.balanceToSlab4 !== null && view.balanceToSlab4 <= 0 ? "text-good" : "text-fg"}`}>
            {view.balanceToSlab4 !== null && view.balanceToSlab4 <= 0 ? "Cleared" : formatCompactCurrency(view.balanceToSlab4)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3 shadow-card">
          <div className={eyebrow}>Working days</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-fg">{view.workingDays.elapsed} / {view.workingDays.total}</div>
          <div className="text-[11px] text-fg-faint">Mon–Sat, holidays excluded</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3 shadow-card">
          <div className={eyebrow}>Working days left</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-fg">{view.workingDays.remaining}</div>
          <div className="text-[11px] text-fg-faint">to close this month's gap</div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface p-4 shadow-card">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-wide text-fg-faint"></th>
              {columns.map((c) => (
                <th key={c.branch} className="pb-2 pr-4 text-left">
                  <div className="text-[12px] font-semibold text-fg">{c.branch === "Central Rgn" ? tglossText("Central Rgn") : c.label}</div>
                  {c.branch !== "Central Rgn" ? <div className="text-[10px] text-fg-faint">{c.branch}</div> : null}
                  {c.includesCo01e ? <div className="text-[9px] font-medium text-accent-text">Includes CO01E</div> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="GS" remaining={view.workingDays.remaining} cells={columns.map((c) => ({ key: c.branch, block: c.gs }))} />
            <Row label="BP" remaining={view.workingDays.remaining} cells={columns.map((c) => ({ key: c.branch, block: c.bp }))} />
            <Row
              label="Ext Sales"
              remaining={view.workingDays.remaining}
              cells={columns.map((c) => ({
                key: c.branch,
                block: c.ext,
                title: `SPR External (BA Tool, reference only): ${formatCompactCurrency(c.ext.sprExternalReference)}`,
              }))}
            />
            <tr className="border-t border-border-subtle">
              <td className="py-2 pr-3 text-[12px] font-semibold text-fg">Total Monthly Target</td>
              {columns.map((c) => (
                <td key={c.branch} className="py-2 pr-4 text-[12px] font-semibold tabular-nums text-fg">
                  {formatCompactCurrency(c.totalMonthlyTarget)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border-subtle">
              <td className="py-3 pr-3 text-[12px] font-semibold text-fg">Slab</td>
              {columns.map((c) => (
                <td key={c.branch} className="py-3 pr-4">
                  <IncentiveSlabIndicator
                    scopeLabel={c.label}
                    actual={c.totalAchieved}
                    slabs={c.branch === "Central Rgn" ? view.regionSlab : c.slab}
                    date={view.date}
                    size={64}
                    showActual={false}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
}
