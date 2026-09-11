import type { BranchView, RegionRollup } from "@/lib/branch-view-data";
import { BODY_PAINT_ONLY_BRANCHES } from "@/lib/report";
import { DateSelect } from "../date-select";
import { BranchOverviewBody } from "./branch-overview-body";
import { RegionRollup as RegionRollupPanel } from "./region-rollup";
import { RegionTable, type RegionTableRow } from "./region-table";

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
}: {
  view: BranchView | null;
  branch: string;
  date: string;
  dates: string[];
  uploadedAt: string;
}) {
  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <Header
        title={`${branch} — Branch Overview`}
        sub={`Month-to-date for ${date}. Data as of ${asOf(uploadedAt)} IST.`}
        date={date}
        dates={dates}
      />
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

export function RegionAccountPage({
  rollup,
  branches,
  date,
  dates,
  uploadedAt,
}: {
  rollup: RegionRollup | null;
  branches: BranchView[];
  date: string;
  dates: string[];
  uploadedAt: string;
}) {
  const rows: RegionTableRow[] = branches.map((v) => ({
    branch: v.branch,
    bodyPaintOnly: BODY_PAINT_ONLY_BRANCHES.has(v.branch),
    totalRevenue: v.totalRevenueMtd,
    rankTotal: v.ranks.totalRevenue,
    revenuePerCar: v.revenuePerCar,
    vasPct: v.vasPct,
    gusRoMtd: v.report.gusRoMtd,
    bpuRoMtd: v.report.bpuRoMtd,
  }));
  const bodies = branches.map((v) => <BranchOverviewBody key={v.branch} view={v} date={date} />);

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <Header
        title={`${rollup?.region ?? "Region"} — Regional Overview`}
        sub={`Month-to-date for ${date}. Pick a branch row to expand its full view. Data as of ${asOf(uploadedAt)} IST.`}
        date={date}
        dates={dates}
      />
      <div className="mt-4 space-y-4">
        {rollup ? <RegionRollupPanel rollup={rollup} /> : null}
        {rows.length ? (
          <RegionTable rows={rows} bodies={bodies} />
        ) : (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-fg-subtle">
            No branch data for this region on {date} yet.
          </div>
        )}
      </div>
    </div>
  );
}
