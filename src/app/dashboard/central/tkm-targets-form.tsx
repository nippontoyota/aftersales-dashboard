"use client";

import { useState, useTransition } from "react";
import { saveCentralMetricTargetsAction } from "@/lib/central-metric-targets/actions";
import { CENTRAL_METRICS, type CentralMetricKey } from "@/lib/central-metric-targets/metrics";
import { control } from "@/lib/ui";

type TargetsByMetric = Record<CentralMetricKey, number | null>;

const FIELD_NAME: Record<CentralMetricKey, string> = {
  bpu: "bpuTarget",
  offtake: "offtakeTarget",
  sprInternal: "sprInternalTarget",
  sprExternal: "sprExternalTarget",
  pmOc: "pmOcTarget",
  battery: "batteryTarget",
  tyre: "tyreTarget",
};

function BranchRow({ month, branch, targets }: { month: string; branch: string; targets: TargetsByMetric }) {
  const [values, setValues] = useState<Record<CentralMetricKey, string>>(
    Object.fromEntries(CENTRAL_METRICS.map((m) => [m.key, targets[m.key] !== null ? String(targets[m.key]) : ""])) as Record<CentralMetricKey, string>
  );
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("month", month);
    formData.set("branch", branch);
    for (const m of CENTRAL_METRICS) formData.set(FIELD_NAME[m.key], values[m.key]);
    startTransition(async () => {
      await saveCentralMetricTargetsAction(formData);
      setSavedAt(Date.now());
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-[90px_repeat(7,1fr)_auto] items-center gap-2">
      <span className="text-[12px] font-medium text-fg">{branch}</span>
      {CENTRAL_METRICS.map((m) => (
        <input
          key={m.key}
          type="number"
          min="0"
          step="any"
          value={values[m.key]}
          onChange={(e) => setValues((v) => ({ ...v, [m.key]: e.target.value }))}
          placeholder={m.label}
          title={m.label}
          className={`${control} text-[11px]`}
        />
      ))}
      <button
        type="submit"
        disabled={isPending}
        className="h-8 rounded-md bg-accent px-3 text-[12px] font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Saving…" : savedAt ? "Saved" : "Save"}
      </button>
    </form>
  );
}

export function TkmTargetsForm({
  month,
  branches,
  currentTargets,
}: {
  month: string;
  branches: string[];
  currentTargets: Record<string, TargetsByMetric>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex w-full items-center justify-between text-left">
        <span className="text-[13px] font-medium text-fg">Set {month}&apos;s TKM Targets</span>
        <svg className={`h-4 w-4 text-fg-faint transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded ? (
        <div className="mt-3 space-y-2 border-t border-border-subtle pt-3">
          <div className="grid grid-cols-[90px_repeat(7,1fr)_auto] gap-2 text-[9.5px] font-medium uppercase tracking-wide text-fg-faint">
            <span>Branch</span>
            {CENTRAL_METRICS.map((m) => (
              <span key={m.key} className="truncate" title={m.label}>
                {m.label}
              </span>
            ))}
            <span />
          </div>
          {branches.map((branch) => (
            <BranchRow key={branch} month={month} branch={branch} targets={currentTargets[branch]} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
