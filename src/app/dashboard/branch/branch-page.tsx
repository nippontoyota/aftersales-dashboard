import type { BranchView } from "@/lib/branch-view-data";
import type { IncentiveSlabTargets } from "@/lib/incentive-slabs/store";
import { DateSelect } from "../date-select";
import { IncentiveSlabIndicator } from "../incentive-slab-indicator";
import { BranchOverviewBody } from "./branch-overview-body";

function asOf(uploadedAt: string): string {
  return new Date(uploadedAt).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function Header({ title, sub, date, dates }: { title: string; sub: string; date: string; dates: string[] }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        <p className="mt-1 text-xs text-fg-faint">{sub}</p>
      </div>
      <DateSelect dates={dates} selected={date} region="All" />
    </div>
  );
}

export function BranchAccountPage({
  view,
  branch,
  date,
  dates,
  uploadedAt,
  incentiveSlabs,
  holidays,
}: {
  view: BranchView | null;
  branch: string;
  date: string;
  dates: string[];
  uploadedAt: string;
  /** Undefined when no target is uploaded for this branch this month —
   * IncentiveSlabIndicator shows a muted placeholder rather than hiding
   * (2026-09-25, at the user's request: every branch should be able to see
   * their own slab progress on their own dashboard). */
  incentiveSlabs?: IncentiveSlabTargets;
  /** HQ-flagged report_holidays, for the Incentive Slab forecast (2026-09-29). */
  holidays?: string[];
}) {
  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <Header
        title={`${branch} — Branch Overview`}
        sub={`Month-to-date for ${date}. Data as of ${asOf(uploadedAt)} IST.`}
        date={date}
        dates={dates}
      />
      <div className="mt-4 flex justify-center rounded-lg border border-border bg-surface p-4 shadow-card sm:justify-start">
        <IncentiveSlabIndicator scopeLabel={branch} actual={view?.totalRevenueMtd ?? null} slabs={incentiveSlabs} date={date} holidays={holidays} size={108} />
      </div>
      <div className="mt-4">
        {view ? (
          <BranchOverviewBody view={view} date={date} />
        ) : (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
            No data for {branch} on {date} yet.
          </div>
        )}
      </div>
    </div>
  );
}
